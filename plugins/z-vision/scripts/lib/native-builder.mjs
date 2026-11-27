import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NATIVE_DIR = path.resolve(__dirname, '..', 'native');

const CS_FILES = [
  'JsonMini.cs',
  'VisionMath.cs',
  'UiaTree.cs',
  'ArrowOverlay.cs',
  'RegionLockOverlay.cs',
  'VirtualPointer.cs',
  'InputArm.cs',
  'ZVisionHost.cs'
];

export function defaultDataDir() {
  if (process.env.ZVISION_DATA_DIR && process.env.ZVISION_DATA_DIR.trim()) {
    return process.env.ZVISION_DATA_DIR.trim();
  }
  return path.join(os.homedir(), '.z-plugin', 'z-vision');
}

export function findCsc() {
  const win = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
  const candidates = [
    path.join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(win, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

export function findGacAssembly(name) {
  const win = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
  const roots = [
    path.join(win, 'Microsoft.NET', 'assembly', 'GAC_MSIL', name),
    path.join(win, 'assembly', 'GAC_MSIL', name)
  ];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    let versions;
    try {
      versions = fs.readdirSync(root);
    } catch {
      continue;
    }
    versions.sort().reverse();
    const preferred = versions.filter((v) => v.startsWith('v4.')).concat(versions);
    for (const v of preferred) {
      const dll = path.join(root, v, `${name}.dll`);
      if (fs.existsSync(dll)) return dll;
    }
  }
  return null;
}

export function findWinRtRefs() {
  const win = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
  const winMetaDir = path.join(win, 'System32', 'WinMetadata');
  const needed = [
    'Windows.Foundation.winmd',
    'Windows.Globalization.winmd',
    'Windows.Graphics.winmd',
    'Windows.Media.winmd',
    'Windows.Storage.winmd'
  ];
  const refs = [];
  for (const f of needed) {
    const p = path.join(winMetaDir, f);
    if (!fs.existsSync(p)) return null;
    refs.push(p);
  }
  const fwDir = path.join(win, 'Microsoft.NET', 'Framework64', 'v4.0.30319');
  for (const dllName of [
    'System.Runtime.dll',
    'System.Runtime.WindowsRuntime.dll',
    'System.Runtime.InteropServices.WindowsRuntime.dll'
  ]) {
    const p = findGacAssembly(dllName.replace(/\.dll$/i, '')) || path.join(fwDir, dllName);
    if (fs.existsSync(p)) refs.push(p);
  }
  return refs;
}

function computeStamp(csc, sources, refs, withWinRt) {
  const h = createHash('sha256');
  for (const f of sources) h.update(fs.readFileSync(f));
  h.update('\0' + csc);
  for (const r of refs) h.update('\0' + r);
  h.update('\0winrt=' + (withWinRt ? '1' : '0'));
  return h.digest('hex');
}

function runCsc(csc, outExe, sources, refs, defines = []) {
  const args = [
    '/nologo',
    '/target:exe',
    '/optimize+',
    '/platform:x64',
    `/out:${outExe}`
  ];
  for (const d of defines) args.push(`/define:${d}`);
  for (const r of refs) args.push(`/reference:${r}`);
  for (const s of sources) args.push(s);

  return spawnSync(csc, args, { encoding: 'utf8', timeout: 60000 });
}

export function ensureNativeHost({ dataDir = defaultDataDir(), force = false } = {}) {
  if (process.platform !== 'win32') {
    const err = new Error('Native ZVisionHost compilation requires Windows.');
    err.code = 'unsupported_platform';
    throw err;
  }

  const csc = findCsc();
  if (!csc) {
    const err = new Error('Stock .NET Framework csc.exe was not found.');
    err.code = 'compiler_not_found';
    throw err;
  }

  const uiaClient = findGacAssembly('UIAutomationClient');
  const uiaTypes = findGacAssembly('UIAutomationTypes');
  const winBase = findGacAssembly('WindowsBase');
  if (!uiaClient || !uiaTypes || !winBase) {
    const err = new Error('Required GAC UIAutomation assemblies were not found.');
    err.code = 'assemblies_not_found';
    throw err;
  }

  const baseRefs = [
    'System.dll',
    'System.Core.dll',
    'System.Drawing.dll',
    'System.Windows.Forms.dll',
    uiaClient,
    uiaTypes,
    winBase
  ];
  const winRtRefs = findWinRtRefs();
  const sources = CS_FILES.map((f) => path.join(NATIVE_DIR, f));
  const binDir = path.join(dataDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  // Attempt 1: With WinRT OCR if WinMetadata is present
  if (winRtRefs) {
    const fullRefs = baseRefs.concat(winRtRefs);
    const stamp = computeStamp(csc, sources, fullRefs, true);
    const exePath = path.join(binDir, `ZVisionHost-${stamp.slice(0, 16)}.exe`);
    if (!force && fs.existsSync(exePath)) {
      return { exePath, winrtOcr: true, cached: true };
    }
    const res = runCsc(csc, exePath, sources, fullRefs, ['HAS_WINRT_OCR']);
    if (res.status === 0 && fs.existsSync(exePath)) {
      return { exePath, winrtOcr: true, cached: false };
    }
  }

  // Fallback: Core UIA + Capture + dHash + NCC + SendInput (always compiles on stock Windows)
  const coreStamp = computeStamp(csc, sources, baseRefs, false);
  const coreExe = path.join(binDir, `ZVisionHost-${coreStamp.slice(0, 16)}.exe`);
  if (!force && fs.existsSync(coreExe)) {
    return { exePath: coreExe, winrtOcr: false, cached: true };
  }
  const coreRes = runCsc(csc, coreExe, sources, baseRefs, []);
  if (coreRes.status !== 0 || !fs.existsSync(coreExe)) {
    const msg = (coreRes.stdout || '') + '\n' + (coreRes.stderr || '');
    const err = new Error(`csc.exe build failed: ${msg.trim()}`);
    err.code = 'build_failed';
    throw err;
  }
  return { exePath: coreExe, winrtOcr: false, cached: false };
}
