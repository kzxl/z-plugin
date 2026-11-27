import { createHostClient } from './host-client.mjs';
import {
  ObservationStore,
  checkActionSafety,
  mapPixelToScreen,
  validatePlanSteps
} from './safety-policy.mjs';

export function hammingDistanceHex(hexA, hexB) {
  if (!hexA || !hexB || hexA.length !== 16 || hexB.length !== 16) return 64;
  const a = BigInt('0x' + hexA);
  const b = BigInt('0x' + hexB);
  let x = a ^ b;
  let dist = 0;
  while (x > 0n) {
    x &= x - 1n;
    dist++;
  }
  return dist;
}

export function formatCompactNodes(nodes = []) {
  if (!Array.isArray(nodes) || nodes.length === 0) return '(no UIA controls matched)';
  return nodes.map((n) => {
    const parts = [`[${n.i}]`, n.role || 'Control'];
    if (n.name) parts.push(`"${n.name}"`);
    if (n.aid) parts.push(`aid=${n.aid}`);
    if (n.val) parts.push(`val="${n.val}"`);
    if (Array.isArray(n.rect) && n.rect.length === 4) {
      parts.push(`(${n.rect[0]},${n.rect[1]} ${n.rect[2]}x${n.rect[3]})`);
    }
    if (Array.isArray(n.patterns) && n.patterns.length > 0) {
      parts.push(`[${n.patterns.join(',')}]`);
    }
    if (n.enabled === false) parts.push('(disabled)');
    if (n.offscreen === true) parts.push('(offscreen)');
    return parts.join(' ');
  }).join('\n');
}

function resolveTarget(obs, opts) {
  const nodes = obs?.nodes || [];

  if (opts.index != null) {
    const node = nodes.find((n) => n.i === opts.index);
    if (!node) {
      const err = new Error(`UIA node index ${opts.index} not found in observation.`);
      err.code = 'target_not_found';
      throw err;
    }
    return { node, screenX: node.cx, screenY: node.cy };
  }

  if (opts.name || opts.automation_id || opts.role) {
    const matches = nodes.filter((n) => {
      if (opts.name && n.name !== opts.name) return false;
      if (opts.automation_id && n.aid !== opts.automation_id) return false;
      if (opts.role && n.role !== opts.role) return false;
      return true;
    });
    if (matches.length === 0) {
      const err = new Error('No UIA node matched exact selector.');
      err.code = 'target_not_found';
      throw err;
    }
    if (matches.length > 1) {
      const err = new Error(`Ambiguous selector matched ${matches.length} UIA nodes; specify index or automation_id.`);
      err.code = 'ambiguous_target';
      throw err;
    }
    const node = matches[0];
    return { node, screenX: node.cx, screenY: node.cy };
  }

  if (opts.ocr_text && obs?.ocr?.lines) {
    const needle = String(opts.ocr_text).trim().toLowerCase();
    const hits = [];
    for (const line of obs.ocr.lines) {
      if ((line.text || '').toLowerCase().includes(needle)) hits.push(line);
      for (const word of line.words || []) {
        if ((word.text || '').toLowerCase() === needle) hits.push(word);
      }
    }
    if (hits.length === 0) {
      const err = new Error(`OCR text '${opts.ocr_text}' not found in observation.`);
      err.code = 'target_not_found';
      throw err;
    }
    return { node: { name: hits[0].text, role: 'OcrText' }, screenX: hits[0].cx, screenY: hits[0].cy };
  }

  if (opts.x != null && opts.y != null) {
    const pt = mapPixelToScreen(obs, opts.x, opts.y);
    return { node: null, screenX: pt.x, screenY: pt.y };
  }

  return { node: null, screenX: undefined, screenY: undefined };
}

export function createVisionEngine({ client = null, store = null } = {}) {
  const host = client || createHostClient();
  const observations = store || new ObservationStore();
  const lastDhashByHwnd = new Map();

  async function status() {
    return host.request('status', {});
  }

  async function windows({ include_hidden = false, filter = '' } = {}) {
    return host.request('windows', { include_hidden, filter });
  }

  async function launch({ exe, args = '', timeout_ms = 8000 } = {}) {
    return host.request('launch', { exe, args, timeout_ms });
  }

  async function observe({
    hwnd = 0,
    query = '',
    max_nodes = 120,
    only_interactive = false,
    with_image = 'auto',
    max_width = 1280,
    with_ocr = false,
    language = '',
    settle_ms = 0,
    save_path = ''
  } = {}) {
    const requestImage = with_image !== false;
    const raw = await host.request('observe', {
      hwnd,
      query,
      max_nodes,
      only_interactive,
      with_image: requestImage,
      max_width,
      with_ocr,
      language,
      settle_ms,
      save_path
    });

    const prevDhash = lastDhashByHwnd.get(raw.hwnd) || null;
    const dist = prevDhash ? hammingDistanceHex(prevDhash, raw.dhash) : 64;
    if (raw.dhash) lastDhashByHwnd.set(raw.hwnd, raw.dhash);

    const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
    const suppressImage = with_image === 'auto' && prevDhash !== null && dist <= 2 && nodes.length >= 5;

    const record = observations.create({
      hwnd: raw.hwnd,
      process: raw.process,
      title: raw.title,
      bounds: raw.bounds,
      imageSize: raw.image_size,
      nodes,
      dhash: raw.dhash,
      ocr: raw.ocr || null
    });

    return {
      observation_id: record.observationId,
      hwnd: raw.hwnd,
      pid: raw.pid,
      process: raw.process,
      title: raw.title,
      bounds: raw.bounds,
      image_size: raw.image_size,
      dhash: raw.dhash,
      dhash_distance: prevDhash ? dist : null,
      nodes,
      compact_tree: formatCompactNodes(nodes),
      ocr: raw.ocr || null,
      image_suppressed: suppressImage,
      image_base64: suppressImage || with_image === false ? null : (raw.image_base64 || null),
      image_mime: suppressImage || with_image === false ? null : (raw.image_mime || null)
    };
  }

  async function buildActPayload(obs, opts) {
    const resolved = resolveTarget(obs, opts);
    const safety = checkActionSafety({
      action: opts.action,
      processName: obs.process,
      targetNode: resolved.node,
      keys: opts.keys,
      text: opts.text,
      confirmSensitive: opts.confirm_sensitive === true,
      allowRestricted: opts.allow_restricted === true,
      reason: opts.reason || ''
    });

    if (!safety.allowed) {
      const err = new Error(safety.message);
      err.code = safety.code;
      throw err;
    }

    const payload = {
      hwnd: obs.hwnd,
      action: opts.action,
      physical: opts.physical !== false,
      button: opts.button || 'left',
      clicks: opts.clicks || 1,
      steps: opts.steps || 6,
      amount: opts.amount ?? -3,
      horizontal: opts.horizontal === true,
      text: opts.text ?? '',
      keys: opts.keys ?? '',
      width: opts.width,
      height: opts.height,
      click_first: opts.click_first === true
    };

    if (resolved.node && typeof resolved.node.i === 'number') {
      payload.index = resolved.node.i;
    }
    if (resolved.screenX != null && resolved.screenY != null) {
      payload.x = resolved.screenX;
      payload.y = resolved.screenY;
      if (opts.x == null && opts.y == null && (opts.action === 'type' || opts.action === 'paste' || opts.action === 'set_value')) {
        payload.click_first = true;
      }
    }
    if (Array.isArray(opts.from) && opts.from.length === 2 && Array.isArray(opts.to) && opts.to.length === 2) {
      const fPt = mapPixelToScreen(obs, opts.from[0], opts.from[1]);
      const tPt = mapPixelToScreen(obs, opts.to[0], opts.to[1]);
      payload.from = [fPt.x, fPt.y];
      payload.to = [tPt.x, tPt.y];
    }
    if (Array.isArray(opts.points) && opts.points.length >= 2) {
      payload.points = opts.points.map(([px, py]) => {
        const pt = mapPixelToScreen(obs, px, py);
        return [pt.x, pt.y];
      });
    }

    return payload;
  }

  async function act(opts = {}) {
    const obs = observations.get(opts.observation_id);
    if (!obs) {
      const err = new Error(`Unknown or expired observation_id '${opts.observation_id}'. Call zvision_observe first.`);
      err.code = 'stale_observation';
      throw err;
    }

    const payload = await buildActPayload(obs, opts);
    let currentBounds = null;
    try {
      const info = await host.request('window_info', { hwnd: opts.hwnd ?? obs.hwnd });
      currentBounds = info?.bounds || null;
    } catch {}

    observations.consume(opts.observation_id, opts.hwnd ?? obs.hwnd, currentBounds);
    const execRes = await host.request('act', payload);

    let postObs = null;
    if (opts.observe_after) {
      postObs = await observe({ hwnd: obs.hwnd, with_image: 'auto' });
    }
    return {
      ok: true,
      ...execRes,
      observation: postObs
    };
  }

  async function plan(opts = {}) {
    const obs = observations.get(opts.observation_id);
    if (!obs) {
      const err = new Error(`Unknown or expired observation_id '${opts.observation_id}'. Call zvision_observe first.`);
      err.code = 'stale_observation';
      throw err;
    }

    const validation = validatePlanSteps(opts.steps, {
      processName: obs.process,
      confirmSensitive: opts.confirm_sensitive === true,
      allowRestricted: opts.allow_restricted === true,
      reason: opts.reason || ''
    });
    if (!validation.valid) {
      const err = new Error(validation.message);
      err.code = validation.code;
      err.stepIndex = validation.stepIndex;
      throw err;
    }

    let currentBounds = null;
    try {
      const info = await host.request('window_info', { hwnd: opts.hwnd ?? obs.hwnd });
      currentBounds = info?.bounds || null;
    } catch {}
    observations.consume(opts.observation_id, opts.hwnd ?? obs.hwnd, currentBounds);

    let currentObs = obs;
    let completed = 0;
    for (let i = 0; i < opts.steps.length; i++) {
      const step = opts.steps[i];
      try {
        if (step.action === 'sleep') {
          await new Promise((r) => setTimeout(r, Math.min(step.ms || 200, 5000)));
        } else if (step.action === 'wait_settle') {
          const deadline = Date.now() + Math.min(step.timeout_ms || 3000, 10000);
          let prev = currentObs.dhash;
          let stableCount = 0;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 150));
            const snap = await observe({ hwnd: currentObs.hwnd, with_image: false });
            currentObs = { ...snap, bounds: snap.bounds, imageSize: snap.image_size };
            if (hammingDistanceHex(prev, snap.dhash) <= 1) {
              stableCount++;
              if (stableCount >= 2) break;
            } else {
              stableCount = 0;
            }
            prev = snap.dhash;
          }
        } else if (step.action === 'wait_text') {
          const deadline = Date.now() + Math.min(step.timeout_ms || 3000, 10000);
          let matched = false;
          while (Date.now() < deadline) {
            const snap = await observe({ hwnd: currentObs.hwnd, query: step.text, with_image: false });
            currentObs = { ...snap, bounds: snap.bounds, imageSize: snap.image_size };
            if (snap.nodes && snap.nodes.length > 0) {
              matched = true;
              break;
            }
            await new Promise((r) => setTimeout(r, 200));
          }
          if (!matched) {
            const err = new Error(`wait_text timed out waiting for '${step.text}'`);
            err.code = 'wait_timeout';
            throw err;
          }
        } else {
          const payload = await buildActPayload(currentObs, {
            ...step,
            confirm_sensitive: step.confirm_sensitive ?? opts.confirm_sensitive,
            allow_restricted: step.allow_restricted ?? opts.allow_restricted,
            reason: step.reason || opts.reason || 'plan step'
          });
          await host.request('act', payload);
        }
        completed++;
      } catch (err) {
        let postObs = null;
        try {
          postObs = await observe({ hwnd: currentObs.hwnd, with_image: 'auto' });
        } catch {}
        return {
          ok: false,
          completed_steps: completed,
          failed_step: i,
          error: { code: err.code || 'step_failed', message: err.message },
          observation: postObs
        };
      }
    }

    const finalObs = await observe({ hwnd: currentObs.hwnd, with_image: 'auto' });
    return {
      ok: true,
      completed_steps: completed,
      observation: finalObs
    };
  }

  async function ocr({ hwnd = 0, roi = null, language = '' } = {}) {
    return host.request('ocr', { hwnd, roi, language });
  }

  async function matchTemplate({ hwnd = 0, template_path, min_score = 0.85 } = {}) {
    return host.request('match_template', { hwnd, template_path, min_score });
  }

  async function stop({ action = 'stop' } = {}) {
    const res = await host.request('stop', { action });
    if (action === 'stop') {
      observations.invalidateAll();
    }
    return res;
  }

  return {
    status,
    windows,
    launch,
    observe,
    act,
    plan,
    ocr,
    matchTemplate,
    stop,
    close: () => host.close()
  };
}
