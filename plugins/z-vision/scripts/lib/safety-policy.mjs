import { randomUUID } from 'node:crypto';

const BLOCKED_PROCESSES = new Set([
  'consent',
  'credentialuibroker',
  'logonui',
  'lockapp'
]);

const CLICK_ONLY_PROCESSES = new Set([
  'windowsterminal',
  'powershell',
  'pwsh',
  'cmd',
  'conhost',
  'wt',
  'code',
  'devenv',
  'rider64',
  'idea64',
  'regedit',
  'taskmgr',
  'mmc',
  'systemsettings',
  'control'
]);

const SENSITIVE_LABEL_RE = /\b(delete|remove|send|submit|pay|purchase|buy|transfer|password|sign[-_\s]?in|format|wipe|erase|uninstall|shutdown|restart)\b|(xóa|thanh\s*toán|chuyển\s*khoản|đăng\s*nhập|mật\s*khẩu|gửi\s*đi|đặt\s*hàng|gỡ\s*cài\s*đặt)/i;

const DANGEROUS_HOTKEY_RE = /^(alt\+f4|ctrl\+shift\+del(?:ete)?|win\+[rlx]|ctrl\+alt\+del(?:ete)?)$/i;

const TEXT_MUTATING_ACTIONS = new Set(['type', 'paste', 'set_value', 'clear_and_type', 'key']);

const ALLOWED_PLAN_ACTIONS = new Set([
  'click',
  'double_click',
  'right_click',
  'move',
  'drag',
  'batch_strokes',
  'scroll',
  'type',
  'clear_and_type',
  'paste',
  'set_value',
  'key',
  'focus',
  'wait_settle',
  'wait_text',
  'wait_control',
  'refresh_uia',
  'sleep'
]);

export function normalizeProcessBase(processName) {
  return String(processName || '')
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, '');
}

export function classifyProcessTier(processName) {
  const base = normalizeProcessBase(processName);
  if (BLOCKED_PROCESSES.has(base)) return 'blocked';
  if (CLICK_ONLY_PROCESSES.has(base)) return 'click-only';
  return 'full';
}

export function checkActionSafety({
  action,
  processName,
  targetNode = null,
  keys = '',
  text = '',
  confirmSensitive = false,
  allowRestricted = false,
  reason = ''
}) {
  const tier = classifyProcessTier(processName);

  if (tier === 'blocked') {
    return {
      allowed: false,
      tier,
      code: 'blocked_process',
      message: `Security fence: '${processName}' is a protected OS/credential process. Hand control to the user.`
    };
  }

  if (tier === 'click-only' && TEXT_MUTATING_ACTIONS.has(action) && !allowRestricted) {
    return {
      allowed: false,
      tier,
      code: 'restricted_process',
      message: `Terminal/IDE fence: '${processName}' is click-only; '${action}' is blocked unless allow_restricted=true.`
    };
  }

  const labelCandidate = [
    targetNode?.name,
    targetNode?.aid,
    targetNode?.val
  ].filter(Boolean).join(' ');

  const normKeys = String(keys || '').replace(/\s+/g, '').toLowerCase();
  const isSensitiveLabel = labelCandidate && SENSITIVE_LABEL_RE.test(labelCandidate);
  const isDangerousKey = action === 'key' && DANGEROUS_HOTKEY_RE.test(normKeys);
  const isSensitiveAction = action === 'resize' && false;

  if ((isSensitiveLabel || isDangerousKey || isSensitiveAction) && !(confirmSensitive === true && String(reason || '').trim().length > 0)) {
    return {
      allowed: false,
      tier,
      code: 'confirmation_required',
      message: `Sensitive action detected (${isDangerousKey ? keys : labelCandidate}). Re-run with confirm_sensitive=true and a clear reason after user approval.`
    };
  }

  return { allowed: true, tier };
}

function makePolicyError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export class ObservationStore {
  constructor({ driftTolerancePx = 4, maxEntries = 64 } = {}) {
    this.driftTolerancePx = driftTolerancePx;
    this.maxEntries = maxEntries;
    this.generation = 1;
    this.records = new Map();
  }

  create({ hwnd, process, title = '', bounds, clientBounds = null, imageSize, nodes = [], dhash = '0000000000000000', ocr = null }) {
    const observationId = 'obs_' + randomUUID().replace(/-/g, '').slice(0, 12);
    const record = {
      observationId,
      hwnd: Number(hwnd),
      process: String(process || ''),
      title: String(title || ''),
      bounds: bounds ? { ...bounds } : null,
      clientBounds: clientBounds ? { ...clientBounds } : null,
      imageSize: imageSize ? { ...imageSize } : null,
      nodes: Array.isArray(nodes) ? nodes : [],
      dhash: String(dhash || '0000000000000000'),
      ocr,
      generation: this.generation,
      consumed: false,
      createdAt: Date.now()
    };
    this.records.set(observationId, record);
    if (this.records.size > this.maxEntries) {
      const oldestKey = this.records.keys().next().value;
      this.records.delete(oldestKey);
    }
    return record;
  }

  get(observationId) {
    return this.records.get(observationId) || null;
  }

  invalidateAll() {
    this.generation += 1;
  }

  consume(observationId, hwnd, currentBounds = null) {
    const record = this.records.get(observationId);
    if (!record) {
      throw makePolicyError('stale_observation', `Unknown or expired observation_id '${observationId}'. Call zvision_observe first.`);
    }
    if (record.consumed) {
      throw makePolicyError('stale_observation', `Observation '${observationId}' was already consumed (one-use). Call zvision_observe again.`);
    }
    if (record.generation !== this.generation) {
      throw makePolicyError('stale_observation', `Observation '${observationId}' was invalidated by emergency stop.`);
    }
    if (hwnd != null && Number(record.hwnd) !== Number(hwnd)) {
      throw makePolicyError('stale_observation', `Observation '${observationId}' belongs to hwnd ${record.hwnd}, not ${hwnd}.`);
    }
    if (currentBounds && record.bounds) {
      const tol = this.driftTolerancePx;
      const dx = Math.abs((currentBounds.x || 0) - (record.bounds.x || 0));
      const dy = Math.abs((currentBounds.y || 0) - (record.bounds.y || 0));
      const dw = Math.abs((currentBounds.w || 0) - (record.bounds.w || 0));
      const dh = Math.abs((currentBounds.h || 0) - (record.bounds.h || 0));
      if (dx > tol || dy > tol || dw > tol || dh > tol) {
        throw makePolicyError('stale_observation', `Window moved or resized since observation '${observationId}' (drift dx=${dx}, dy=${dy}, dw=${dw}, dh=${dh}).`);
      }
    }
    record.consumed = true;
    return record;
  }
}

export function mapCoordsToScreen(obs, px, py, coordSpace = 'image') {
  const space = String(coordSpace || 'image').toLowerCase();
  if (space === 'screen') {
    return { x: Math.round(px), y: Math.round(py) };
  }
  if (space === 'client') {
    const cb = obs?.clientBounds || obs?.bounds || { x: 0, y: 0 };
    return { x: Math.round((cb.x || 0) + px), y: Math.round((cb.y || 0) + py) };
  }
  if (space === 'window') {
    const b = obs?.bounds || { x: 0, y: 0 };
    return { x: Math.round((b.x || 0) + px), y: Math.round((b.y || 0) + py) };
  }
  const bounds = obs?.bounds || { x: 0, y: 0, w: 0, h: 0 };
  const img = obs?.imageSize;
  if (!img || !img.w || !img.h || !bounds.w || !bounds.h) {
    return { x: Math.round(bounds.x + px), y: Math.round(bounds.y + py) };
  }
  return {
    x: Math.round(bounds.x + (px * bounds.w) / img.w),
    y: Math.round(bounds.y + (py * bounds.h) / img.h)
  };
}

export function mapPixelToScreen(obs, px, py) {
  return mapCoordsToScreen(obs, px, py, 'image');
}

export function validateParallelLanes(lanes, policyContext = {}) {
  if (!Array.isArray(lanes) || lanes.length < 1 || lanes.length > 8) {
    return {
      valid: false,
      laneIndex: -1,
      code: 'invalid_parallel_lanes',
      message: 'Parallel lanes must be a non-empty array of 1..8 lanes.'
    };
  }
  for (let i = 0; i < lanes.length; i++) {
    const lane = lanes[i];
    if (!lane || typeof lane !== 'object') {
      return {
        valid: false,
        laneIndex: i,
        code: 'invalid_parallel_lane',
        message: `Lane ${i} must be an object.`
      };
    }
    const res = validatePlanSteps(lane.steps, {
      ...policyContext,
      processName: lane.processName || policyContext.processName || ''
    });
    if (!res.valid) {
      return {
        valid: false,
        laneIndex: i,
        stepIndex: res.stepIndex,
        code: res.code,
        message: `Lane ${lane.id || i}: ${res.message}`
      };
    }
  }
  return { valid: true };
}

export function validatePlanSteps(steps, policyContext = {}) {
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 200) {
    return {
      valid: false,
      stepIndex: -1,
      code: 'invalid_plan',
      message: 'Plan steps must be a non-empty array of 1..200 steps.'
    };
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step || typeof step !== 'object' || !ALLOWED_PLAN_ACTIONS.has(step.action)) {
      return {
        valid: false,
        stepIndex: i,
        code: 'invalid_plan_step',
        message: `Step ${i} has invalid or unsupported action '${step?.action}'.`
      };
    }

    if (step.action === 'wait_settle' || step.action === 'wait_text' || step.action === 'wait_control' || step.action === 'refresh_uia' || step.action === 'sleep') {
      continue;
    }

    const safety = checkActionSafety({
      action: step.action,
      processName: policyContext.processName || '',
      targetNode: step.targetNode || (step.name ? { name: step.name } : null),
      keys: step.keys || '',
      text: step.text || '',
      confirmSensitive: step.confirm_sensitive ?? policyContext.confirmSensitive ?? false,
      allowRestricted: step.allow_restricted ?? policyContext.allowRestricted ?? false,
      reason: step.reason || policyContext.reason || ''
    });

    if (!safety.allowed) {
      return {
        valid: false,
        stepIndex: i,
        code: safety.code,
        message: `Step ${i} blocked: ${safety.message}`
      };
    }
  }

  return { valid: true };
}
