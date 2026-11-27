import { createHostClient } from './host-client.mjs';
import { createMacroStore, renderMacroSteps } from './macro-store.mjs';
import { createAuditLogger } from './audit-log.mjs';
import {
  ObservationStore,
  checkActionSafety,
  mapCoordsToScreen,
  mapPixelToScreen,
  validatePlanSteps,
  validateParallelLanes
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

  if (opts.som_id != null) {
    const marks = obs?.somMarks || [];
    const mk = marks.find((m) => m.id === opts.som_id);
    if (!mk) {
      const err = new Error(`SoM mark id ${opts.som_id} not found in observation.`);
      err.code = 'target_not_found';
      throw err;
    }
    return { node: { name: mk.label || `som#${mk.id}`, role: 'SomMark' }, screenX: mk.cx, screenY: mk.cy };
  }

  if (opts.x != null && opts.y != null) {
    const pt = mapCoordsToScreen(obs, opts.x, opts.y, opts.coord_space || 'image');
    return { node: null, screenX: pt.x, screenY: pt.y };
  }

  return { node: null, screenX: undefined, screenY: undefined };
}

export function createVisionEngine({ client = null, store = null, dataDir = null, audit = true } = {}) {
  const host = client || createHostClient();
  const observations = store || new ObservationStore();
  const macros = createMacroStore(dataDir ? { dataDir } : {});
  const auditLog = createAuditLogger({ ...(dataDir ? { dataDir } : {}), enabled: audit !== false });
  const lastDhashByHwnd = new Map();
  const lastNodesByHwnd = new Map();

  async function status() {
    return host.request('status', {});
  }

  async function windows({ include_hidden = false, filter = '', launch_exe = '', launch_args = '', timeout_ms = 8000, wait_for = '', wait_state = 'open' } = {}) {
    let launched = null;
    if (launch_exe) {
      launched = await host.request('launch', { exe: launch_exe, args: launch_args, timeout_ms });
    }
    if (wait_for) {
      const start = Date.now();
      const limit = Math.min(15000, Math.max(200, Number(timeout_ms) || 5000));
      const wantClosed = String(wait_state || 'open').toLowerCase() === 'closed';
      let lastRes = { windows: [] };
      while (true) {
        lastRes = await host.request('windows', { include_hidden, filter: wait_for });
        const count = (lastRes.windows || []).length;
        const okMatch = wantClosed ? count === 0 : count > 0;
        if (okMatch || (Date.now() - start) >= limit) {
          const out = { ...lastRes, matched: okMatch, waited_ms: Date.now() - start };
          return launched ? { ...out, launched } : out;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    const res = await host.request('windows', { include_hidden, filter });
    return launched ? { ...res, launched } : res;
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
    with_uia = 'full',
    with_som = 'off',
    roi = null,
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
      auto_gate: with_image === 'auto',
      with_uia,
      with_som,
      roi: Array.isArray(roi) && roi.length === 4 ? roi.map((v) => Math.round(v)) : null,
      max_width,
      with_ocr,
      language,
      settle_ms,
      save_path
    });

    const prevDhash = lastDhashByHwnd.get(raw.hwnd) || null;
    const dist = raw.dhash_distance != null
      ? raw.dhash_distance
      : (prevDhash ? hammingDistanceHex(prevDhash, raw.dhash) : 64);
    if (raw.dhash) lastDhashByHwnd.set(raw.hwnd, raw.dhash);

    const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : [];
    let effectiveNodes = rawNodes;
    let compactTree;
    if (raw.uia_skipped) {
      effectiveNodes = [];
      compactTree = '(UIA skipped)';
    } else if (raw.uia_unchanged) {
      effectiveNodes = lastNodesByHwnd.get(raw.hwnd) || [];
      compactTree = `(UIA unchanged — cached ${effectiveNodes.length} controls)`;
    } else {
      lastNodesByHwnd.set(raw.hwnd, rawNodes);
      compactTree = formatCompactNodes(rawNodes);
    }

    const hostChanged = raw.visual_changed;
    const suppressImage = Boolean(raw.image_suppressed) || (
      with_image === 'auto' &&
      prevDhash !== null &&
      (hostChanged === false || (hostChanged == null && dist <= 2)) &&
      effectiveNodes.length >= 5
    );
    const hideImage = suppressImage || with_image === false;
    const fallbackSize = raw.roi
      ? { w: raw.roi[2], h: raw.roi[3] }
      : (raw.bounds ? { w: raw.bounds.w, h: raw.bounds.h } : null);
    const effectiveImageSize = hideImage && fallbackSize
      ? fallbackSize
      : raw.image_size;

    const record = observations.create({
      hwnd: raw.hwnd,
      process: raw.process,
      title: raw.title,
      bounds: raw.bounds,
      clientBounds: raw.client_bounds || null,
      imageSize: effectiveImageSize,
      nodes: effectiveNodes,
      dhash: raw.dhash,
      ocr: raw.ocr || null,
      somMarks: raw.som_marks || []
    });

    return {
      observation_id: record.observationId,
      hwnd: raw.hwnd,
      pid: raw.pid,
      process: raw.process,
      title: raw.title,
      bounds: raw.bounds,
      raw_bounds: raw.raw_bounds || null,
      client_bounds: raw.client_bounds || null,
      roi: raw.roi || null,
      image_size: effectiveImageSize,
      dhash: raw.dhash,
      dhash_distance: prevDhash ? dist : (raw.dhash_distance ?? null),
      changed_pixels_pct: raw.changed_pixels_pct ?? null,
      dirty_rect: raw.dirty_rect || null,
      visual_changed: raw.visual_changed ?? null,
      nodes: effectiveNodes,
      compact_tree: compactTree,
      uia_unchanged: Boolean(raw.uia_unchanged),
      uia_skipped: Boolean(raw.uia_skipped),
      ocr: raw.ocr || null,
      som_marks: raw.som_marks || [],
      image_suppressed: suppressImage,
      image_base64: hideImage ? null : (raw.image_base64 || null),
      image_mime: hideImage ? null : (raw.image_mime || null)
    };
  }

  async function buildActPayload(obs, opts) {
    const coordSpace = opts.coord_space || (opts.action === 'move_window' ? 'screen' : 'image');
    const resolved = resolveTarget(obs, { ...opts, coord_space: coordSpace });
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

    const mode = opts.mode || (opts.physical === false ? 'uia' : 'physical');

    const payload = {
      hwnd: opts.hwnd ?? obs.hwnd,
      action: opts.action,
      mode,
      speed: opts.speed || 'normal',
      px_per_step: opts.px_per_step || 0,
      pressure: opts.pressure || 720,
      expect_change: opts.expect_change === true,
      physical: mode !== 'uia' && opts.physical !== false,
      restore_cursor: opts.restore_cursor === true,
      button: opts.button || 'left',
      clicks: opts.clicks || 1,
      steps: opts.steps ?? 6,
      amount: opts.amount ?? -3,
      horizontal: opts.horizontal === true,
      text: opts.text ?? '',
      keys: opts.keys ?? '',
      width: opts.width,
      height: opts.height,
      click_first: opts.click_first === true
    };
    if (opts.value !== undefined) payload.value = opts.value;
    if (opts.snap) payload.snap = opts.snap;
    if (opts.file_path) payload.file_path = opts.file_path;
    if (opts.confirm !== undefined) payload.confirm = opts.confirm !== false;
    if (opts.modifiers) payload.modifiers = opts.modifiers;
    if (opts.duration_ms != null) payload.duration_ms = opts.duration_ms;
    if (opts.show_arrows != null) {
      payload.show_arrows = opts.show_arrows === true;
    }
    if (opts.lock_region !== undefined && opts.lock_region !== null) {
      payload.lock_region = opts.lock_region;
      if (opts.lock_region === 'roi' && (opts.roi || obs.roi)) {
        payload.roi = opts.roi || obs.roi;
      }
      if (opts.lock_policy) payload.lock_policy = opts.lock_policy;
      if (opts.lock_ttl_ms != null) payload.lock_ttl_ms = opts.lock_ttl_ms;
    }

    if (resolved.node && typeof resolved.node.i === 'number') {
      payload.index = resolved.node.i;
    }
    if (resolved.screenX != null && resolved.screenY != null) {
      payload.x = resolved.screenX;
      payload.y = resolved.screenY;
      if (opts.x == null && opts.y == null && (opts.action === 'type' || opts.action === 'clear_and_type' || opts.action === 'paste' || opts.action === 'set_value')) {
        payload.click_first = true;
      }
    } else if (opts.template_path) {
      const m = await matchTemplate({
        hwnd: opts.hwnd ?? obs.hwnd,
        template_path: opts.template_path,
        min_score: opts.min_score ?? 0.85,
        roi: opts.roi || null,
        scales: opts.scales || null,
        max_matches: 1
      });
      if (!m || !m.found) {
        const err = new Error(`Template '${opts.template_path}' not found (best score=${m?.score ?? 0}).`);
        err.code = 'target_not_found';
        throw err;
      }
      payload.x = m.screen_cx;
      payload.y = m.screen_cy;
    }
    if (Array.isArray(opts.from) && opts.from.length === 2 && Array.isArray(opts.to) && opts.to.length === 2) {
      const fPt = mapCoordsToScreen(obs, opts.from[0], opts.from[1], coordSpace);
      const tPt = mapCoordsToScreen(obs, opts.to[0], opts.to[1], coordSpace);
      payload.from = [fPt.x, fPt.y];
      payload.to = [tPt.x, tPt.y];
    }
    if (Array.isArray(opts.points) && opts.points.length >= 2) {
      payload.points = opts.points.map(([px, py]) => {
        const pt = mapCoordsToScreen(obs, px, py, coordSpace);
        return [pt.x, pt.y];
      });
    }
    if (Array.isArray(opts.strokes) && opts.strokes.length > 0) {
      payload.strokes = opts.strokes.map((stroke) =>
        (Array.isArray(stroke) ? stroke : []).map(([px, py]) => {
          const pt = mapCoordsToScreen(obs, px, py, coordSpace);
          return [pt.x, pt.y];
        })
      );
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
    const t0 = Date.now();
    let execRes;
    try {
      execRes = await host.request('act', payload);
      auditLog.log({
        event: 'act',
        hwnd: obs.hwnd,
        process: obs.process,
        action: opts.action,
        mode: payload.mode,
        resolved_mode: execRes?.resolved_mode || payload.mode,
        ok: true,
        duration_ms: Date.now() - t0
      });
    } catch (err) {
      auditLog.log({
        event: 'act',
        hwnd: obs.hwnd,
        process: obs.process,
        action: opts.action,
        mode: payload.mode,
        ok: false,
        error_code: err.code || 'act_failed',
        duration_ms: Date.now() - t0
      });
      throw err;
    }

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

  async function evalCondition(step, currentObs, opts) {
    const a = String(step.action || '');
    const negate = step.negate === true;

    if (a === 'if_control' || a === 'assert_control') {
      const snap = await observe({ hwnd: currentObs.hwnd, query: step.query || '', with_image: false, with_uia: 'full' });
      const textNeedle = step.text ? String(step.text).trim().toLowerCase() : '';
      const hit = (snap.nodes || []).find((n) => {
        if (step.name && n.name !== step.name) return false;
        if (step.automation_id && n.aid !== step.automation_id) return false;
        if (step.role && n.role !== step.role) return false;
        if (textNeedle) {
          const hay = [n.name, n.val, n.aid].filter(Boolean).join(' ').toLowerCase();
          if (!hay.includes(textNeedle)) return false;
        }
        return true;
      });
      const rawMatched = Boolean(hit);
      const matched = negate ? !rawMatched : rawMatched;
      const targetDesc = step.name || step.automation_id || step.role || step.text || 'control';
      return { matched, detail: `${targetDesc} ${rawMatched ? 'present' : 'absent'}`, refreshedObs: snap };
    }

    if (a === 'if_ocr' || a === 'assert_ocr') {
      const ocrRes = await ocr({ hwnd: currentObs.hwnd, roi: step.roi || opts.roi || null, language: step.language || '' });
      const needle = String(step.text || '').trim().toLowerCase();
      const rawMatched = Boolean(ocrRes && ocrRes.available && String(ocrRes.text || '').toLowerCase().includes(needle));
      const matched = negate ? !rawMatched : rawMatched;
      return { matched, detail: `ocr '${step.text || ''}' ${rawMatched ? 'matched' : 'missing'}`, refreshedObs: null };
    }

    const pt = mapCoordsToScreen(currentObs, step.x || 0, step.y || 0, step.coord_space || opts.coord_space || 'image');
    const pxRes = await samplePixels({ hwnd: currentObs.hwnd, points: [[pt.x, pt.y]] });
    const px = pxRes?.pixels?.[0];
    const target = step.target_rgb || step.rgb || [0, 0, 0];
    const tol = Number(step.tolerance ?? 18);
    let rawMatched = false;
    let actualDesc = 'out_of_bounds';
    if (px && px.in_bounds) {
      const dist = Math.hypot((px.r || 0) - (target[0] || 0), (px.g || 0) - (target[1] || 0), (px.b || 0) - (target[2] || 0));
      rawMatched = dist <= tol;
      actualDesc = `${px.hex || [px.r, px.g, px.b].join(',')} (dist=${dist.toFixed(1)})`;
    }
    const matched = negate ? !rawMatched : rawMatched;
    return { matched, detail: `pixel (${pt.x},${pt.y})=${actualDesc}`, refreshedObs: null };
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

    const planStartMs = Date.now();
    const state = {
      currentObs: obs,
      completed: 0,
      assertions_passed: 0,
      retries_used: 0
    };
    const isNonRetryable = (code) => (
      code === 'emergency_stopped' || code === 'blocked_process' ||
      code === 'restricted_process' || code === 'confirmation_required' ||
      code === 'stale_observation'
    );
    async function runWithStepRetry(step, fn) {
      const retryCap = Math.max(0, Math.min(5, Number(step.retry) || 0));
      const backoffMs = Math.min(3000, Math.max(50, Number(step.backoff_ms) || 250));
      for (let attempt = 0; ; attempt++) {
        try {
          return await fn();
        } catch (err) {
          if (attempt >= retryCap || isNonRetryable(err.code)) throw err;
          state.retries_used++;
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }
    const isDynamicStep = (a) => (
      a === 'wait_settle' || a === 'wait_text' || a === 'wait_control' ||
      a === 'wait_window' || a === 'wait_ocr' || a === 'wait_pixel_color' ||
      a === 'wait_template' || a === 'refresh_uia' ||
      a === 'if_control' || a === 'if_ocr' || a === 'if_pixel' ||
      a === 'assert_control' || a === 'assert_ocr' || a === 'assert_pixel'
    );

    async function executeStepList(stepList, depth = 0) {
      let i = 0;
      while (i < stepList.length) {
        const step = stepList[i];
        if (isDynamicStep(step.action)) {
          try {
            if (step.action === 'assert_control' || step.action === 'assert_ocr' || step.action === 'assert_pixel') {
              await runWithStepRetry(step, async () => {
                const ev = await evalCondition(step, state.currentObs, opts);
                if (ev.refreshedObs) {
                  state.currentObs = {
                    ...ev.refreshedObs,
                    bounds: ev.refreshedObs.bounds,
                    clientBounds: ev.refreshedObs.client_bounds || null,
                    imageSize: ev.refreshedObs.image_size
                  };
                }
                if (!ev.matched) {
                  const err = new Error(step.message || `Assertion failed (${step.action}): ${ev.detail}`);
                  err.code = 'assertion_failed';
                  err.failedIndex = i;
                  throw err;
                }
              });
              state.assertions_passed++;
            } else if (step.action === 'if_control' || step.action === 'if_ocr' || step.action === 'if_pixel') {
              const ev = await evalCondition(step, state.currentObs, opts);
              if (ev.refreshedObs) {
                state.currentObs = {
                  ...ev.refreshedObs,
                  bounds: ev.refreshedObs.bounds,
                  clientBounds: ev.refreshedObs.client_bounds || null,
                  imageSize: ev.refreshedObs.image_size
                };
              }
              const branch = ev.matched ? step.then_steps : step.else_steps;
              if (Array.isArray(branch) && branch.length > 0) {
                await executeStepList(branch, depth + 1);
              }
            } else if (step.action === 'wait_window') {
              const wRes = await windows({
                wait_for: step.filter || step.title || step.process || '',
                wait_state: step.wait_state || 'open',
                include_hidden: step.include_hidden === true,
                timeout_ms: step.timeout_ms || 5000
              });
              if (!wRes.matched) {
                const err = new Error(`wait_window timed out waiting for '${step.filter || step.title || step.process || ''}'`);
                err.code = 'wait_timeout';
                throw err;
              }
              if (String(step.wait_state || 'open').toLowerCase() !== 'closed' && wRes.windows?.[0] && step.switch_to !== false) {
                const snap = await observe({ hwnd: wRes.windows[0].hwnd, with_image: false, with_uia: 'full' });
                state.currentObs = { ...snap, bounds: snap.bounds, clientBounds: snap.client_bounds || null, imageSize: snap.image_size };
              }
            } else if (step.action === 'refresh_uia') {
              const snap = await observe({ hwnd: state.currentObs.hwnd, with_image: false, with_uia: 'full', query: step.query || '' });
              state.currentObs = { ...snap, bounds: snap.bounds, clientBounds: snap.client_bounds || null, imageSize: snap.image_size };
            } else if (step.action === 'wait_settle') {
              const deadline = Date.now() + Math.min(step.timeout_ms || 3000, 10000);
              let prev = state.currentObs.dhash;
              let stableCount = 0;
              while (Date.now() < deadline) {
                await new Promise((r) => setTimeout(r, 150));
                const snap = await observe({ hwnd: state.currentObs.hwnd, with_image: false, with_uia: 'off' });
                state.currentObs = { ...state.currentObs, dhash: snap.dhash, bounds: snap.bounds, clientBounds: snap.client_bounds || null, imageSize: snap.image_size };
                if (hammingDistanceHex(prev, snap.dhash) <= 1 && snap.visual_changed === false) {
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
                const snap = await observe({ hwnd: state.currentObs.hwnd, query: step.text, with_image: false });
                state.currentObs = { ...snap, bounds: snap.bounds, clientBounds: snap.client_bounds || null, imageSize: snap.image_size };
                if (snap.nodes && snap.nodes.length > 0) {
                  matched = true;
                  break;
                }
                await new Promise((r) => setTimeout(r, 150));
              }
              if (!matched) {
                const err = new Error(`wait_text timed out waiting for '${step.text}'`);
                err.code = 'wait_timeout';
                throw err;
              }
            } else if (step.action === 'wait_control') {
              const deadline = Date.now() + Math.min(step.timeout_ms || 3000, 10000);
              let matched = false;
              while (Date.now() < deadline) {
                const snap = await observe({ hwnd: state.currentObs.hwnd, query: step.query || '', with_image: false, with_uia: 'full' });
                const found = (snap.nodes || []).some((n) => {
                  if (step.name && n.name !== step.name) return false;
                  if (step.automation_id && n.aid !== step.automation_id) return false;
                  if (step.role && n.role !== step.role) return false;
                  return true;
                });
                if (found) {
                  state.currentObs = { ...snap, bounds: snap.bounds, clientBounds: snap.client_bounds || null, imageSize: snap.image_size };
                  matched = true;
                  break;
                }
                await new Promise((r) => setTimeout(r, 120));
              }
              if (!matched) {
                const err = new Error(`wait_control timed out waiting for ${step.name || step.automation_id || step.role || 'control'}`);
                err.code = 'wait_timeout';
                throw err;
              }
            } else if (step.action === 'wait_ocr') {
              const deadline = Date.now() + Math.min(15000, Math.max(200, step.timeout_ms || 5000));
              const needle = String(step.text || '').trim().toLowerCase();
              const wantGone = String(step.state || 'present').toLowerCase() === 'gone';
              let matched = false;
              while (Date.now() < deadline) {
                const ocrRes = await ocr({ hwnd: state.currentObs.hwnd, roi: step.roi || opts.roi || null, language: step.language || '' });
                const found = Boolean(ocrRes && ocrRes.available && String(ocrRes.text || '').toLowerCase().includes(needle));
                if (wantGone ? !found : found) {
                  matched = true;
                  break;
                }
                await new Promise((r) => setTimeout(r, 200));
              }
              if (!matched) {
                const err = new Error(`wait_ocr timed out waiting for '${step.text || ''}'`);
                err.code = 'wait_timeout';
                throw err;
              }
            } else if (step.action === 'wait_pixel_color') {
              const deadline = Date.now() + Math.min(15000, Math.max(200, step.timeout_ms || 5000));
              const pt = mapCoordsToScreen(state.currentObs, step.x || 0, step.y || 0, step.coord_space || opts.coord_space || 'image');
              const target = step.target_rgb || step.rgb || [0, 0, 0];
              const tol = Number(step.tolerance ?? 18);
              const invert = step.invert === true;
              let matched = false;
              while (Date.now() < deadline) {
                const pxRes = await samplePixels({ hwnd: state.currentObs.hwnd, points: [[pt.x, pt.y]] });
                const px = pxRes?.pixels?.[0];
                if (px && px.in_bounds) {
                  const dist = Math.hypot((px.r || 0) - (target[0] || 0), (px.g || 0) - (target[1] || 0), (px.b || 0) - (target[2] || 0));
                  if (invert ? dist > tol : dist <= tol) {
                    matched = true;
                    break;
                  }
                }
                await new Promise((r) => setTimeout(r, 120));
              }
              if (!matched) {
                const err = new Error(`wait_pixel_color timed out at (${pt.x},${pt.y})`);
                err.code = 'wait_timeout';
                throw err;
              }
            } else if (step.action === 'wait_template') {
              const deadline = Date.now() + Math.min(15000, Math.max(200, step.timeout_ms || 5000));
              const wantGone = String(step.state || 'present').toLowerCase() === 'gone';
              let matched = false;
              while (Date.now() < deadline) {
                const mt = await matchTemplate({
                  hwnd: state.currentObs.hwnd,
                  template_path: step.template_path,
                  min_score: step.min_score ?? 0.85,
                  roi: step.roi || opts.roi || null,
                  scales: step.scales || null,
                  max_matches: 1
                });
                const found = Boolean(mt && mt.found);
                if (wantGone ? !found : found) {
                  matched = true;
                  break;
                }
                await new Promise((r) => setTimeout(r, 200));
              }
              if (!matched) {
                const err = new Error(`wait_template timed out waiting for '${step.template_path || ''}'`);
                err.code = 'wait_timeout';
                throw err;
              }
            }
            state.completed++;
            i++;
          } catch (err) {
            if (err.failedIndex == null) err.failedIndex = i;
            throw err;
          }
          continue;
        }

        // Collect contiguous native steps (without step-level retry) into one 1-RPC plan_batch
        const segStart = i;
        if (Number(step.retry) > 0) {
          try {
            await runWithStepRetry(step, async () => {
              const st = step;
              const payload = st.action === 'sleep'
                ? { action: 'sleep', ms: Math.min(st.ms || 200, 5000) }
                : await buildActPayload(state.currentObs, {
                    ...st,
                    coord_space: st.coord_space || opts.coord_space,
                    mode: st.mode || opts.mode,
                    speed: st.speed || opts.speed,
                    px_per_step: st.px_per_step ?? opts.px_per_step,
                    restore_cursor: st.restore_cursor ?? opts.restore_cursor,
                    show_arrows: st.show_arrows ?? opts.show_arrows,
                    confirm_sensitive: st.confirm_sensitive ?? opts.confirm_sensitive,
                    allow_restricted: st.allow_restricted ?? opts.allow_restricted,
                    reason: st.reason || opts.reason || 'plan step'
                  });
              if (payload.action === 'sleep') {
                await new Promise((r) => setTimeout(r, payload.ms));
              } else {
                let singleHandled = false;
                try {
                  const batchRes = await host.request('plan_batch', {
                    hwnd: opts.hwnd ?? state.currentObs.hwnd,
                    mode: opts.mode || 'physical',
                    speed: opts.speed || 'normal',
                    px_per_step: opts.px_per_step || 0,
                    restore_cursor: opts.restore_cursor === true,
                    steps: [payload]
                  }, { timeoutMs: 30000 });
                  singleHandled = true;
                  if (batchRes && batchRes.ok === false) {
                    const err = new Error(batchRes.error?.message || 'Step failed');
                    err.code = batchRes.error?.code || 'step_failed';
                    throw err;
                  }
                } catch (batchErr) {
                  if (singleHandled || (batchErr.code !== 'unknown_command' && !/Unexpected mock cmd/i.test(batchErr.message || ''))) {
                    throw batchErr;
                  }
                  await host.request('act', payload);
                }
              }
            });
            state.completed++;
            i++;
          } catch (err) {
            if (err.failedIndex == null) err.failedIndex = segStart;
            throw err;
          }
          continue;
        }

        const batchPayloads = [];
        try {
          while (i < stepList.length && !isDynamicStep(stepList[i].action) && !(Number(stepList[i].retry) > 0)) {
            const st = stepList[i];
            if (st.action === 'sleep') {
              batchPayloads.push({ action: 'sleep', ms: Math.min(st.ms || 200, 5000) });
            } else {
              const payload = await buildActPayload(state.currentObs, {
                ...st,
                coord_space: st.coord_space || opts.coord_space,
                mode: st.mode || opts.mode,
                speed: st.speed || opts.speed,
                px_per_step: st.px_per_step ?? opts.px_per_step,
                restore_cursor: st.restore_cursor ?? opts.restore_cursor,
                show_arrows: st.show_arrows ?? opts.show_arrows,
                confirm_sensitive: st.confirm_sensitive ?? opts.confirm_sensitive,
                allow_restricted: st.allow_restricted ?? opts.allow_restricted,
                reason: st.reason || opts.reason || 'plan step'
              });
              batchPayloads.push(payload);
            }
            i++;
          }

          let batchHandled = false;
          try {
            const batchReq = {
              hwnd: opts.hwnd ?? state.currentObs.hwnd,
              mode: opts.mode || 'physical',
              speed: opts.speed || 'normal',
              px_per_step: opts.px_per_step || 0,
              restore_cursor: opts.restore_cursor === true,
              steps: batchPayloads
            };
            if (opts.lock_region !== undefined && opts.lock_region !== null) {
              batchReq.lock_region = opts.lock_region;
              if (opts.lock_policy) batchReq.lock_policy = opts.lock_policy;
              if (opts.lock_ttl_ms != null) batchReq.lock_ttl_ms = opts.lock_ttl_ms;
              if (opts.roi || state.currentObs.roi) batchReq.roi = opts.roi || state.currentObs.roi;
            }
            const batchRes = await host.request('plan_batch', batchReq, { timeoutMs: Math.max(30000, batchPayloads.length * 1000) });
            batchHandled = true;
            if (batchRes && batchRes.ok === false) {
              const doneInBatch = batchRes.completed_steps || 0;
              const err = new Error(batchRes.error?.message || 'Batch step failed');
              err.code = batchRes.error?.code || 'step_failed';
              err.failedIndex = segStart + doneInBatch;
              state.completed += doneInBatch;
              throw err;
            }
            state.completed += batchRes?.completed_steps ?? batchPayloads.length;
          } catch (batchErr) {
            if (batchHandled || (batchErr.code !== 'unknown_command' && !/Unexpected mock cmd/i.test(batchErr.message || ''))) {
              throw batchErr;
            }
            // Fallback only if legacy host/mock lacks plan_batch
            for (let j = 0; j < batchPayloads.length; j++) {
              const bp = batchPayloads[j];
              if (bp.action === 'sleep') {
                await new Promise((r) => setTimeout(r, bp.ms));
              } else {
                try {
                  await host.request('act', bp);
                } catch (actErr) {
                  actErr.failedIndex = segStart + j;
                  throw actErr;
                }
              }
              state.completed++;
            }
          }
        } catch (err) {
          if (err.failedIndex == null) err.failedIndex = segStart;
          throw err;
        }
      }
    }

    try {
      await executeStepList(opts.steps, 0);
    } catch (err) {
      let postObs = null;
      try {
        postObs = await observe({ hwnd: state.currentObs.hwnd, with_image: 'auto', with_uia: opts.with_uia || 'full', roi: opts.roi || null });
      } catch {}
      auditLog.log({
        event: 'plan',
        hwnd: state.currentObs.hwnd,
        process: state.currentObs.process,
        mode: opts.mode || 'physical',
        ok: false,
        error_code: err.code || 'step_failed',
        completed_steps: state.completed,
        assertions_passed: state.assertions_passed,
        retries_used: state.retries_used,
        duration_ms: Date.now() - planStartMs
      });
      return {
        ok: false,
        completed_steps: state.completed,
        assertions_passed: state.assertions_passed,
        retries_used: state.retries_used,
        failed_step: err.failedIndex ?? 0,
        error: { code: err.code || 'step_failed', message: err.message },
        observation: postObs
      };
    }

    let finalObs = null;
    if (opts.observe_after !== false) {
      finalObs = await observe({
        hwnd: state.currentObs.hwnd,
        with_image: 'auto',
        with_uia: opts.with_uia || 'full',
        roi: opts.roi || null
      });
    }
    auditLog.log({
      event: 'plan',
      hwnd: state.currentObs.hwnd,
      process: state.currentObs.process,
      mode: opts.mode || 'physical',
      ok: true,
      completed_steps: state.completed,
      assertions_passed: state.assertions_passed,
      retries_used: state.retries_used,
      duration_ms: Date.now() - planStartMs
    });
    return {
      ok: true,
      completed_steps: state.completed,
      assertions_passed: state.assertions_passed,
      retries_used: state.retries_used,
      observation: finalObs
    };
  }

  async function parallel(opts = {}) {
    const obs = observations.get(opts.observation_id);
    if (!obs) {
      const err = new Error(`Unknown or expired observation_id '${opts.observation_id}'. Call zvision_observe first.`);
      err.code = 'stale_observation';
      throw err;
    }

    const validation = validateParallelLanes(opts.lanes, {
      processName: obs.process,
      confirmSensitive: opts.confirm_sensitive === true,
      allowRestricted: opts.allow_restricted === true,
      reason: opts.reason || ''
    });
    if (!validation.valid) {
      const err = new Error(validation.message);
      err.code = validation.code;
      err.laneIndex = validation.laneIndex;
      err.stepIndex = validation.stepIndex;
      throw err;
    }

    let currentBounds = null;
    try {
      const info = await host.request('window_info', { hwnd: opts.hwnd ?? obs.hwnd });
      currentBounds = info?.bounds || null;
    } catch {}
    observations.consume(opts.observation_id, opts.hwnd ?? obs.hwnd, currentBounds);

    const parallelMode = opts.mode || 'virtual';
    const mappedLanes = [];
    for (let li = 0; li < opts.lanes.length; li++) {
      const lane = opts.lanes[li];
      const mappedSteps = [];
      for (let si = 0; si < lane.steps.length; si++) {
        const step = lane.steps[si];
        if (step.action === 'sleep') {
          mappedSteps.push({ action: 'sleep', ms: Math.min(step.ms || 200, 5000) });
        } else {
          const stepPayload = await buildActPayload(obs, {
            ...step,
            hwnd: step.hwnd ?? lane.hwnd ?? opts.hwnd ?? obs.hwnd,
            coord_space: step.coord_space || lane.coord_space || opts.coord_space || 'image',
            mode: step.mode || lane.mode || parallelMode,
            restore_cursor: step.restore_cursor ?? opts.restore_cursor,
            show_arrows: step.show_arrows ?? opts.show_arrows ?? true,
            confirm_sensitive: step.confirm_sensitive ?? opts.confirm_sensitive,
            allow_restricted: step.allow_restricted ?? opts.allow_restricted,
            reason: step.reason || opts.reason || 'parallel step'
          });
          mappedSteps.push(stepPayload);
        }
      }
      mappedLanes.push({
        id: lane.id || `lane_${li + 1}`,
        hwnd: lane.hwnd ?? opts.hwnd ?? obs.hwnd,
        steps: mappedSteps
      });
    }

    const res = await host.request('parallel', {
      mode: parallelMode,
      show_arrows: opts.show_arrows !== false,
      lanes: mappedLanes
    });

    const lanes = Array.isArray(res?.lanes) ? res.lanes : [];
    const ok = lanes.length > 0 ? lanes.every((l) => l.ok !== false) : true;
    let finalObs = null;
    if (opts.observe_after !== false) {
      try {
        finalObs = await observe({ hwnd: opts.hwnd ?? obs.hwnd, with_image: 'auto' });
      } catch {}
    }

    return {
      ok,
      mode: res?.mode || parallelMode,
      lanes,
      observation: finalObs
    };
  }

  async function ocr({ hwnd = 0, roi = null, language = '' } = {}) {
    return host.request('ocr', { hwnd, roi, language });
  }

  async function matchTemplate({ hwnd = 0, template_path, min_score = 0.85, roi = null, scales = null, max_matches = 1 } = {}) {
    return host.request('match_template', { hwnd, template_path, min_score, roi, scales, max_matches });
  }

  async function samplePixels({ hwnd = 0, points = [] } = {}) {
    return host.request('sample_pixels', { hwnd, points });
  }

  async function findColorBounds({ hwnd = 0, target_rgb, tolerance = 12, invert = false, roi = null } = {}) {
    return host.request('find_color_bounds', { hwnd, target_rgb, tolerance, invert, roi });
  }

  async function vectorizeImage({ image_path, canvas_rect, palette_size = 9, max_strokes = 320 } = {}) {
    return host.request('vectorize_image', { image_path, canvas_rect, palette_size, max_strokes });
  }

  async function compareReference({ hwnd = 0, image_path, roi = null, grid_cols = 6, grid_rows = 4, top_n = 6 } = {}) {
    return host.request('compare_reference', { hwnd, image_path, roi, grid_cols, grid_rows, top_n });
  }

  async function extractTable({ hwnd = 0, index = -1, max_rows = 100, max_cols = 32, auto_scroll = false, max_pages = 10 } = {}) {
    return host.request('extract_table', { hwnd, index, max_rows, max_cols, auto_scroll, max_pages });
  }

  async function clipboardGet({ save_image_path = '' } = {}) {
    return host.request('clipboard_get', { save_image_path });
  }

  async function clipboardSet({ kind = 'text', clipboard_kind, text = '', image_path = '', files = [] } = {}) {
    return host.request('clipboard_set', { kind: clipboard_kind || kind, text, image_path, files });
  }

  async function saveMacro({ name, description = '', steps, defaults = {}, mode = null, coord_space = null, lock_region = null, lock_policy = null } = {}) {
    const check = validatePlanSteps(steps, { processName: '', confirmSensitive: true, allowRestricted: true, reason: 'macro_save' });
    if (!check.valid) {
      const err = new Error(check.message);
      err.code = check.code;
      err.stepIndex = check.stepIndex;
      throw err;
    }
    return macros.save({ name, description, steps, defaults, mode, coord_space, lock_region, lock_policy });
  }

  async function listMacros() {
    return macros.list();
  }

  async function deleteMacro({ name } = {}) {
    return macros.remove(name);
  }

  async function runMacro({ name, vars = {}, hwnd = 0, observation_id = '', confirm_sensitive = false, allow_restricted = false, observe_after = false, lock_region, lock_policy, reason = '' } = {}) {
    const rec = macros.get(name);
    if (!rec) {
      const err = new Error(`Macro '${name}' not found.`);
      err.code = 'macro_not_found';
      throw err;
    }
    const renderedSteps = renderMacroSteps(rec.steps, vars, rec.defaults || {});
    let useObsId = observation_id;
    let useHwnd = hwnd;
    if (!useObsId) {
      const autoObs = await observe({ hwnd: useHwnd, with_image: false, with_uia: 'full' });
      useObsId = autoObs.observation_id;
      useHwnd = autoObs.hwnd;
    }
    const planRes = await plan({
      hwnd: useHwnd,
      observation_id: useObsId,
      steps: renderedSteps,
      mode: rec.mode || undefined,
      coord_space: rec.coord_space || undefined,
      lock_region: lock_region ?? rec.lock_region ?? undefined,
      lock_policy: lock_policy ?? rec.lock_policy ?? undefined,
      confirm_sensitive,
      allow_restricted,
      observe_after,
      reason: reason || `macro:${rec.name}`
    });
    return { ...planRes, macro: rec.name };
  }

  async function lockRegion({ action = 'lock', hwnd = 0, region = null, policy = 'soft', ttl_ms = 30000, follow_window = false, status_text = '' } = {}) {
    const res = await host.request('lock', { action, hwnd, region, policy, ttl_ms, follow_window, status_text });
    auditLog.log({
      event: 'lock',
      hwnd,
      action,
      ok: true,
      blocked_events: res?.blocked_events
    });
    return res;
  }

  async function stop({ action = 'stop' } = {}) {
    const res = await host.request('stop', { action });
    if (action === 'stop') {
      observations.invalidateAll();
    }
    auditLog.log({
      event: 'stop',
      action,
      ok: true
    });
    return res;
  }

  return {
    status,
    windows,
    launch,
    observe,
    act,
    plan,
    parallel,
    ocr,
    matchTemplate,
    samplePixels,
    findColorBounds,
    vectorizeImage,
    compareReference,
    extractTable,
    clipboardGet,
    clipboardSet,
    saveMacro,
    listMacros,
    deleteMacro,
    runMacro,
    lockRegion,
    getAuditLogPath: () => auditLog.getLogPath(),
    stop,
    close: () => host.close()
  };
}
