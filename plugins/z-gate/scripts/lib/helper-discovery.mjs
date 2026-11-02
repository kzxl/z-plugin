/**
 * Asset-First Helper Discovery Engine for Z-Gate (R_REUSE)
 * Scans codebase helpers and utility directories to prevent redundant hand-rolled code.
 * Includes local caching (.zero-gate/helpers-cache.json) for sub-millisecond retrieval.
 */

import fs from 'node:fs';
import path from 'node:path';

const HELPER_DIR_NAMES = new Set([
  'helpers', 'helper',
  'extensions', 'extension',
  'utils', 'util', 'utilities',
  'common', 'shared', 'core', 'constants'
]);

const VALID_EXTENSIONS = new Set([
  '.cs', '.ts', '.js', '.py', '.go', '.rs', '.java', '.kt'
]);

const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'bin', 'obj', 'dist', 'build', '.vs', '.idea', 'target', 'vendor', '.zero-gate', '.zero-token'
]);

function loadHelperCache(cwd) {
  const cacheFile = path.join(cwd, '.zero-gate', 'helpers-cache.json');
  try {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {
    return { files: {} };
  }
}

function saveHelperCache(cwd, cache) {
  const cacheDir = path.join(cwd, '.zero-gate');
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'helpers-cache.json'), JSON.stringify(cache));
  } catch {}
}

/**
 * Scan directory recursively for helper files
 */
function findHelperFiles(dir, maxDepth = 4, currentDepth = 0) {
  if (currentDepth > maxDepth || !fs.existsSync(dir)) return [];

  const helperFiles = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.isDirectory()) {
        const lower = ent.name.toLowerCase();
        if (IGNORED_DIRS.has(lower)) continue;

        const subDir = path.join(dir, ent.name);
        if (HELPER_DIR_NAMES.has(lower)) {
          collectFiles(subDir, helperFiles);
        } else {
          helperFiles.push(...findHelperFiles(subDir, maxDepth, currentDepth + 1));
        }
      } else if (ent.isFile()) {
        const lowerName = ent.name.toLowerCase();
        if (
          VALID_EXTENSIONS.has(path.extname(lowerName)) &&
          (lowerName.includes('helper') || lowerName.includes('extension') || lowerName.includes('util'))
        ) {
          helperFiles.push(path.join(dir, ent.name));
        }
      }
    }
  } catch {}

  return helperFiles;
}

function collectFiles(dir, list) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory() && !IGNORED_DIRS.has(ent.name.toLowerCase())) {
        collectFiles(full, list);
      } else if (ent.isFile() && VALID_EXTENSIONS.has(path.extname(ent.name.toLowerCase()))) {
        list.push(full);
      }
    }
  } catch {}
}

/**
 * Extract public methods from helper source code
 */
function extractMethods(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const methods = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (ext === '.cs') {
      const match = line.match(/public\s+(?:static\s+)?(?:async\s+)?([a-zA-Z0-9_<>?, ]+)\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
      if (match && !/^(class|interface|struct|enum|namespace)\b/.test(match[1])) {
        const params = match[3].trim();
        const isExtension = params.startsWith('this ');
        methods.push({
          line: i + 1,
          methodName: match[2],
          signature: `${match[1]} ${match[2]}(${params})${isExtension ? ' [Extension]' : ''}`,
          isExtension,
          summary: lines[i - 1]?.includes('///') ? lines[i - 1].replace(/\/\/\/\s*/, '').trim() : ''
        });
      }
    } else if (ext === '.ts' || ext === '.js') {
      const match = line.match(/(?:export\s+)?(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/) ||
                    line.match(/(?:export\s+const\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/);
      if (match) {
        methods.push({
          line: i + 1,
          methodName: match[1],
          signature: line,
          summary: lines[i - 1]?.startsWith('//') ? lines[i - 1].replace(/\/\/\s*/, '').trim() : ''
        });
      }
    } else if (ext === '.py') {
      const match = line.match(/^def\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\):/);
      if (match && !match[1].startsWith('_')) {
        methods.push({
          line: i + 1,
          methodName: match[1],
          signature: line,
          summary: ''
        });
      }
    }
  }

  return methods;
}

/**
 * Search helpers in repository matching query with cache
 */
export function findHelpers({ query = '', cwd = process.cwd(), language = null, maxMatches = 15 }) {
  const helperFiles = findHelperFiles(cwd);
  if (helperFiles.length === 0) return [];

  const queryTerms = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 1);

  const cache = loadHelperCache(cwd);
  let cacheModified = false;
  const results = [];

  for (const file of helperFiles) {
    if (language && !file.toLowerCase().endsWith(language.toLowerCase())) {
      continue;
    }

    const relPath = path.relative(cwd, file).replace(/\\/g, '/');
    let mtime = 0;
    try {
      mtime = fs.statSync(file).mtimeMs;
    } catch {}

    let methods;
    if (cache.files && cache.files[file] && cache.files[file].mtime === mtime) {
      methods = cache.files[file].methods;
    } else {
      methods = extractMethods(file);
      cache.files = cache.files || {};
      cache.files[file] = { mtime, methods };
      cacheModified = true;
    }

    for (const m of methods) {
      const targetText = `${path.basename(file)} ${m.methodName} ${m.signature} ${m.summary}`.toLowerCase();

      const matchedCount = queryTerms.filter(t => targetText.includes(t)).length;
      if (queryTerms.length === 0 || matchedCount > 0) {
        results.push({
          file: relPath,
          line: m.line,
          methodName: m.methodName,
          signature: m.signature,
          isExtension: m.isExtension || false,
          summary: m.summary,
          score: matchedCount
        });
      }
    }
  }

  if (cacheModified) {
    saveHelperCache(cwd, cache);
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxMatches);
}
