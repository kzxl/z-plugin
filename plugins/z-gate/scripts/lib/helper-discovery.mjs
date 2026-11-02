/**
 * Asset-First Helper Discovery Engine for Z-Gate (R_REUSE)
 * Scans codebase helpers and utility directories to prevent redundant hand-rolled code.
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
  'node_modules', '.git', 'bin', 'obj', 'dist', 'build', '.vs', '.idea', 'target', 'vendor'
]);

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
          // All files in this directory are helper candidates
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
      // C# static / extension method: public static [returnType] MethodName(...)
      const match = line.match(/public\s+(?:static\s+)?(?:async\s+)?([a-zA-Z0-9_<>?, ]+)\s+([a-zA-Z0-9_]+)\s*\(([^)]*)\)/);
      if (match && !/^(class|interface|struct|enum|namespace)\b/.test(match[1])) {
        methods.push({
          line: i + 1,
          methodName: match[2],
          signature: `${match[1]} ${match[2]}(${match[3]})`,
          summary: lines[i - 1]?.includes('///') ? lines[i - 1].replace(/\/\/\/\s*/, '').trim() : ''
        });
      }
    } else if (ext === '.ts' || ext === '.js') {
      // TS/JS export function or static method
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
      // Python def
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
 * Search helpers in repository matching query
 */
export function findHelpers({ query = '', cwd = process.cwd(), language = null, maxMatches = 15 }) {
  const helperFiles = findHelperFiles(cwd);
  if (helperFiles.length === 0) return [];

  const queryTerms = String(query || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 1);

  const results = [];

  for (const file of helperFiles) {
    if (language && !file.toLowerCase().endsWith(language.toLowerCase())) {
      continue;
    }

    const relPath = path.relative(cwd, file).replace(/\\/g, '/');
    const methods = extractMethods(file);

    for (const m of methods) {
      const targetText = `${path.basename(file)} ${m.methodName} ${m.signature} ${m.summary}`.toLowerCase();

      // Check if all query terms match or any match
      const matchedCount = queryTerms.filter(t => targetText.includes(t)).length;
      if (queryTerms.length === 0 || matchedCount > 0) {
        results.push({
          file: relPath,
          line: m.line,
          methodName: m.methodName,
          signature: m.signature,
          summary: m.summary,
          score: matchedCount
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxMatches);
}
