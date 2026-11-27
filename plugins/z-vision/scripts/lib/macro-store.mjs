import fs from 'node:fs';
import path from 'node:path';
import { defaultDataDir } from './native-builder.mjs';

const VALID_MACRO_NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const EXACT_VAR_RE = /^\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}$/;
const INLINE_VAR_RE = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;

function makeMacroError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function sanitizeMacroName(name) {
  const s = String(name || '').trim();
  if (!VALID_MACRO_NAME_RE.test(s)) {
    throw makeMacroError(
      'invalid_macro_name',
      `Invalid macro name '${name}'. Use 1..64 alphanumeric, underscore, or hyphen characters.`
    );
  }
  return s;
}

function resolveVar(key, vars, defaults) {
  if (vars && Object.prototype.hasOwnProperty.call(vars, key) && vars[key] !== undefined) {
    return vars[key];
  }
  if (defaults && Object.prototype.hasOwnProperty.call(defaults, key) && defaults[key] !== undefined) {
    return defaults[key];
  }
  throw makeMacroError('missing_macro_var', `Missing required macro variable '{{${key}}}'.`);
}

function renderValue(val, vars, defaults) {
  if (typeof val === 'string') {
    const exact = EXACT_VAR_RE.exec(val);
    if (exact) {
      return resolveVar(exact[1], vars, defaults);
    }
    if (!val.includes('{{')) return val;
    return val.replace(INLINE_VAR_RE, (_, key) => String(resolveVar(key, vars, defaults)));
  }
  if (Array.isArray(val)) {
    return val.map((item) => renderValue(item, vars, defaults));
  }
  if (val && typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = renderValue(v, vars, defaults);
    }
    return out;
  }
  return val;
}

export function renderMacroSteps(steps, vars = {}, defaults = {}) {
  if (!Array.isArray(steps) || steps.length === 0) {
    throw makeMacroError('invalid_plan', 'Macro steps must be a non-empty array.');
  }
  return renderValue(steps, vars, defaults);
}

export function createMacroStore({ dataDir = defaultDataDir() } = {}) {
  const macroDir = path.join(dataDir, 'macros');

  function filePathFor(name) {
    return path.join(macroDir, `${sanitizeMacroName(name)}.json`);
  }

  function save({
    name,
    description = '',
    steps,
    defaults = {},
    mode = null,
    coord_space = null,
    lock_region = null,
    lock_policy = null
  }) {
    const cleanName = sanitizeMacroName(name);
    if (!Array.isArray(steps) || steps.length < 1 || steps.length > 200) {
      throw makeMacroError('invalid_plan', 'Macro steps must be a non-empty array of 1..200 steps.');
    }
    fs.mkdirSync(macroDir, { recursive: true });
    const fp = filePathFor(cleanName);
    const record = {
      name: cleanName,
      description: String(description || ''),
      steps,
      defaults: defaults && typeof defaults === 'object' ? defaults : {},
      mode: mode || null,
      coord_space: coord_space || null,
      lock_region: lock_region ?? null,
      lock_policy: lock_policy || null,
      step_count: steps.length,
      updated_at: new Date().toISOString()
    };
    fs.writeFileSync(fp, JSON.stringify(record, null, 2), 'utf8');
    return { saved: true, name: cleanName, step_count: steps.length, path: fp };
  }

  function get(name) {
    const fp = filePathFor(name);
    if (!fs.existsSync(fp)) return null;
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  }

  function list() {
    if (!fs.existsSync(macroDir)) return { macros: [] };
    const entries = fs.readdirSync(macroDir)
      .filter((f) => f.endsWith('.json'))
      .sort();
    const macros = [];
    for (const f of entries) {
      try {
        const rec = JSON.parse(fs.readFileSync(path.join(macroDir, f), 'utf8'));
        macros.push({
          name: rec.name || f.replace(/\.json$/i, ''),
          description: rec.description || '',
          step_count: rec.step_count || (Array.isArray(rec.steps) ? rec.steps.length : 0),
          defaults: rec.defaults || {},
          updated_at: rec.updated_at || null
        });
      } catch {}
    }
    return { macros };
  }

  function remove(name) {
    const cleanName = sanitizeMacroName(name);
    const fp = filePathFor(cleanName);
    if (!fs.existsSync(fp)) return { deleted: false, name: cleanName };
    fs.unlinkSync(fp);
    return { deleted: true, name: cleanName };
  }

  return { save, get, list, remove };
}
