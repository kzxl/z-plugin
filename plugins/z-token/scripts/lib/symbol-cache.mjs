// Persistent Prefix-Sharded Symbol Cache for z-token
//
// Features:
// 1. Two-tier storage: Project (<workspace>/.z-plugin/cache/symbols/) and Global (~/.z-plugin/)
// 2. Prefix Bucket Sharding: xx.json (2-char alphanumeric prefix) avoids monolithic JSON bloat
// 3. Self-ignoring Git protection: creates .z-plugin/.gitignore with "*" automatically
// 4. Zero stale cache: mtime validation against fs.statSync guarantees freshness (<1ms cache hit)
// 5. Zero native C++ dependency: Pure Node.js JSON buckets with atomic rename writes

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { collectFiles } from "./fsindex.mjs";

const CODE_EXT = new Set([
  ".cs", ".fs", ".vb", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".java", ".kt", ".kts", ".scala", ".groovy", ".py", ".rb", ".php",
  ".go", ".rs", ".swift", ".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".hh",
  ".m", ".mm", ".lua", ".pl", ".pm", ".r", ".jl", ".dart", ".ex", ".exs",
  ".erl", ".hrl", ".hs", ".clj", ".cljs", ".sh", ".bash", ".zsh", ".ps1", ".psm1",
  ".sql", ".vue", ".svelte", ".astro", ".zig", ".nim", ".sol",
  ".tf", ".hcl", ".proto", ".graphql", ".gql",
]);

const COMMENT_RE = /^\s*(?:\/\/|#(?!\[)|--|\*|\/\*|<!--)/;
const CONTROL_RE = /^\s*(?:if|for|while|switch|catch|return|new|using|lock|foreach|do|else|try|throw|await|yield|case|default|break|continue|goto|sizeof|typeof|nameof|assert|raise|pass|del|import|from|require|include|echo|print|puts)\b/;

const KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "default", "break",
  "continue", "return", "try", "catch", "finally", "throw", "throws",
  "class", "interface", "struct", "enum", "record", "trait", "namespace",
  "package", "import", "export", "using", "from", "as", "new", "this",
  "super", "base", "true", "false", "null", "nil", "undefined", "void",
  "int", "string", "bool", "boolean", "float", "double", "byte", "char",
  "long", "short", "var", "let", "const", "static", "public", "private",
  "protected", "internal", "abstract", "final", "sealed", "virtual", "override",
  "async", "await", "yield", "sizeof", "typeof", "nameof", "is", "in"
]);

// ---------------------------------------------------------------- Prefix & Paths

/**
 * Calculates a 2-character sanitized alphanumeric prefix for bucket sharding.
 * E.g., "CalculateTotal" -> "ca", "a" -> "a_", "_init" -> "in", "$$" -> "__"
 */
export function getSymbolPrefix(symbolName) {
  const clean = String(symbolName || "").trim().toLowerCase();
  if (!clean) return "__";
  const sanitized = clean.replace(/[^a-z0-9]/g, "");
  if (sanitized.length >= 2) {
    return sanitized.slice(0, 2);
  } else if (sanitized.length === 1) {
    return sanitized + "_";
  }
  return "__";
}

/**
 * Resolves standard 2-tier storage paths for z-plugin.
 */
export function getCachePaths(workspaceRoot = process.cwd()) {
  const root = path.resolve(workspaceRoot);
  const projectDir = path.join(root, ".z-plugin");
  const cacheDir = path.join(projectDir, "cache", "symbols");
  const gitignorePath = path.join(projectDir, ".gitignore");
  const globalDir = path.join(os.homedir(), ".z-plugin");
  return {
    workspaceRoot: root,
    projectDir,
    cacheDir,
    gitignorePath,
    globalDir,
  };
}

/**
 * Ensures cache directories exist and writes .z-plugin/.gitignore if absent.
 */
export function ensureCacheDirs(workspaceRoot = process.cwd()) {
  const paths = getCachePaths(workspaceRoot);
  try {
    if (!fs.existsSync(paths.cacheDir)) {
      fs.mkdirSync(paths.cacheDir, { recursive: true });
    }
    if (!fs.existsSync(paths.gitignorePath)) {
      fs.writeFileSync(paths.gitignorePath, "*\n", "utf8");
    }
  } catch {}
  return paths;
}

// ---------------------------------------------------------------- Bucket I/O

/**
 * In-memory bucket cache for repeated lookups in the same process turn.
 * Max 64 buckets LRU to limit memory footprint.
 */
const MEM_BUCKETS = new Map();
const MAX_MEM_BUCKETS = 64;

function touchMemBucket(key, data) {
  if (MEM_BUCKETS.has(key)) {
    MEM_BUCKETS.delete(key);
  } else if (MEM_BUCKETS.size >= MAX_MEM_BUCKETS) {
    const oldest = MEM_BUCKETS.keys().next().value;
    MEM_BUCKETS.delete(oldest);
  }
  MEM_BUCKETS.set(key, data);
}

export function loadBucket(cacheDir, prefix) {
  const bucketKey = path.join(cacheDir, `${prefix}.json`);
  if (MEM_BUCKETS.has(bucketKey)) {
    return MEM_BUCKETS.get(bucketKey);
  }

  if (!fs.existsSync(bucketKey)) {
    return { version: 1, symbols: {} };
  }

  try {
    const raw = fs.readFileSync(bucketKey, "utf8");
    const data = JSON.parse(raw);
    if (data && typeof data === "object" && data.symbols) {
      touchMemBucket(bucketKey, data);
      return data;
    }
  } catch {}
  return { version: 1, symbols: {} };
}

export function saveBucket(cacheDir, prefix, bucketData) {
  const bucketKey = path.join(cacheDir, `${prefix}.json`);
  const tmpKey = `${bucketKey}.tmp.${process.pid}.${Date.now()}`;
  try {
    const content = JSON.stringify(bucketData, null, 2);
    fs.writeFileSync(tmpKey, content, "utf8");
    try {
      fs.renameSync(tmpKey, bucketKey);
    } catch {
      // Windows rename fallback when target file is temporarily locked
      fs.copyFileSync(tmpKey, bucketKey);
      try { fs.unlinkSync(tmpKey); } catch {}
    }
    touchMemBucket(bucketKey, bucketData);
    return true;
  } catch {
    try { if (fs.existsSync(tmpKey)) fs.unlinkSync(tmpKey); } catch {}
    return false;
  }
}

// ---------------------------------------------------------------- Symbol Extraction

/**
 * Extracts symbols (types, functions, methods, properties) from source text.
 */
export function extractFileSymbols(content) {
  if (!content || typeof content !== "string") return [];
  const lines = content.split(/\r?\n/);
  const symbols = [];
  const seenInFile = new Set();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || COMMENT_RE.test(line) || CONTROL_RE.test(line)) continue;

    let sym = null;

    // 1. Types: class, interface, struct, enum, record, trait, type
    const typeMatch = line.match(/\b(?:class|interface|struct|enum|record|trait|type)\s+([A-Za-z_$][\w$]*)/);
    if (typeMatch && !KEYWORDS.has(typeMatch[1].toLowerCase())) {
      sym = { name: typeMatch[1], kind: "type", line: i + 1, signature: line.trim() };
    }

    // 2. Keyword functions: function, def, defp, defn, func, fn, sub, proc
    if (!sym) {
      const funcMatch = line.match(/\b(?:function|def|defp|defn|func|fun|fn|sub|proc)\s+([A-Za-z_$][\w$]*)/);
      if (funcMatch && !KEYWORDS.has(funcMatch[1].toLowerCase())) {
        sym = { name: funcMatch[1], kind: "func", line: i + 1, signature: line.trim() };
      }
    }

    // 3. Arrow / assign functions: const/let/var Foo = ...
    if (!sym) {
      const arrowMatch = line.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/);
      if (arrowMatch && !KEYWORDS.has(arrowMatch[1].toLowerCase())) {
        sym = { name: arrowMatch[1], kind: "func", line: i + 1, signature: line.trim() };
      }
    }

    // 4. Go method receiver: func (r *Receiver) MethodName(...)
    if (!sym) {
      const goMethodMatch = line.match(/\bfunc\s*\([^)]+\)\s*([A-Za-z_$][\w$]*)\s*\(/);
      if (goMethodMatch && !KEYWORDS.has(goMethodMatch[1].toLowerCase())) {
        sym = { name: goMethodMatch[1], kind: "func", line: i + 1, signature: line.trim() };
      }
    }

    // 5. C# / Java / C++ methods: public Task<int> CalculateDiscount(...)
    if (!sym) {
      const methodMatch = line.match(/(?:public|private|protected|internal|static|virtual|override|async|sealed|extern)\s+(?:[\w<>[\],.?*&]+\s+)+([A-Za-z_$][\w$]*)\s*(?:<[^>]+>)?\s*\([^;]*\)/);
      if (methodMatch && !KEYWORDS.has(methodMatch[1].toLowerCase())) {
        sym = { name: methodMatch[1], kind: "method", line: i + 1, signature: line.trim() };
      }
    }

    // 6. JS/TS class methods: calculateTotal(...) { or async getItems(...) {
    if (!sym) {
      const jsMethodMatch = line.match(/^\s*(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/);
      if (jsMethodMatch && !KEYWORDS.has(jsMethodMatch[1].toLowerCase())) {
        sym = { name: jsMethodMatch[1], kind: "method", line: i + 1, signature: line.trim() };
      }
    }

    // 7. C# Properties: public int Count { get; set; } or Count => ...
    if (!sym) {
      const propMatch = line.match(/(?:public|private|protected|internal|static|virtual|override)\s+(?:[\w<>[\],.?*&]+\s+)+([A-Za-z_$][\w$]*)\s*(?::\s*[\w<>[\],.?]+)?\s*(?:=>|\{\s*(?:get|set|init))/);
      if (propMatch && !KEYWORDS.has(propMatch[1].toLowerCase())) {
        sym = { name: propMatch[1], kind: "prop", line: i + 1, signature: line.trim() };
      }
    }

    if (sym) {
      const key = `${sym.name}:${sym.line}`;
      if (!seenInFile.has(key)) {
        seenInFile.add(key);
        symbols.push(sym);
      }
    }
  }

  return symbols;
}

// ---------------------------------------------------------------- Store & Invalidate

/**
 * Stores extracted symbols for a specific file into corresponding prefix buckets.
 */
export function storeSymbolsForFile(workspaceRoot, relFile, symbols, mtimeMs) {
  const normRel = relFile.replace(/\\/g, "/");
  const { cacheDir } = ensureCacheDirs(workspaceRoot);

  // Group symbols by prefix
  const groups = new Map();
  for (const sym of symbols) {
    const prefix = getSymbolPrefix(sym.name);
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(sym);
  }

  for (const [prefix, symList] of groups.entries()) {
    const bucket = loadBucket(cacheDir, prefix);
    if (!bucket.symbols) bucket.symbols = {};

    for (const sym of symList) {
      const key = sym.name.toLowerCase();
      if (!Array.isArray(bucket.symbols[key])) bucket.symbols[key] = [];

      // Remove existing entry for same file and line/name
      bucket.symbols[key] = bucket.symbols[key].filter(
        (e) => !(e.file === normRel && e.line === sym.line)
      );

      bucket.symbols[key].push({
        name: sym.name,
        file: normRel,
        line: sym.line,
        kind: sym.kind,
        signature: sym.signature,
        mtime: mtimeMs,
      });
    }

    saveBucket(cacheDir, prefix, bucket);
  }
}

/**
 * Invalidates any entries in the cache belonging to a specific file.
 */
export function invalidateFile(workspaceRoot, relFile) {
  const normRel = relFile.replace(/\\/g, "/");
  const { cacheDir } = getCachePaths(workspaceRoot);
  if (!fs.existsSync(cacheDir)) return;

  try {
    const bucketFiles = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
    for (const bf of bucketFiles) {
      const prefix = bf.replace(".json", "");
      const bucket = loadBucket(cacheDir, prefix);
      let changed = false;

      for (const key of Object.keys(bucket.symbols || {})) {
        if (!Array.isArray(bucket.symbols[key])) continue;
        const prevLen = bucket.symbols[key].length;
        bucket.symbols[key] = bucket.symbols[key].filter((e) => e.file !== normRel);
        if (bucket.symbols[key].length !== prevLen) {
          changed = true;
          if (bucket.symbols[key].length === 0) {
            delete bucket.symbols[key];
          }
        }
      }

      if (changed) {
        saveBucket(cacheDir, prefix, bucket);
      }
    }
  } catch {}
}

// ---------------------------------------------------------------- Lookup

/**
 * Looks up a symbol from prefix-sharded cache with mtime freshness verification.
 * Returns array of valid candidates: [{ name, file, absPath, line, kind, signature, mtime }]
 */
export function lookupSymbol(workspaceRoot, symbolName, opts = {}) {
  const cleanSym = String(symbolName || "").trim();
  if (!cleanSym) return [];

  const { cacheDir, workspaceRoot: root } = getCachePaths(workspaceRoot);
  if (!fs.existsSync(cacheDir)) return [];

  const prefix = getSymbolPrefix(cleanSym);
  const bucket = loadBucket(cacheDir, prefix);
  const key = cleanSym.toLowerCase();

  const candidates = Array.isArray(bucket.symbols?.[key]) ? bucket.symbols[key] : null;
  if (!candidates || candidates.length === 0) return [];

  const validHits = [];
  const maxCandidates = opts.limit ?? 10;
  const targetFileFilter = opts.file
    ? opts.file.replace(/\\/g, "/").toLowerCase()
    : null;

  for (const item of candidates) {
    if (validHits.length >= maxCandidates) break;
    const normFile = item.file.replace(/\\/g, "/");
    if (targetFileFilter && !normFile.toLowerCase().endsWith(targetFileFilter) && !targetFileFilter.endsWith(normFile.toLowerCase())) {
      continue;
    }

    const absPath = path.resolve(root, item.file);
    try {
      const stat = fs.statSync(absPath);
      // Validate freshness: mtimeMs must match cached mtime
      if (Math.abs(stat.mtimeMs - item.mtime) < 5) {
        validHits.push({
          ...item,
          absPath,
        });
      } else {
        // File modified: trigger background re-index for this file
        try {
          const content = fs.readFileSync(absPath, "utf8");
          const updatedSymbols = extractFileSymbols(content);
          storeSymbolsForFile(root, item.file, updatedSymbols, stat.mtimeMs);
          const reCheck = updatedSymbols.find((s) => s.name.toLowerCase() === key);
          if (reCheck) {
            validHits.push({
              name: reCheck.name,
              file: item.file,
              absPath,
              line: reCheck.line,
              kind: reCheck.kind,
              signature: reCheck.signature,
              mtime: stat.mtimeMs,
            });
          }
        } catch {}
      }
    } catch {
      // File deleted: ignore
    }
  }

  // Exact case match preferred first
  validHits.sort((a, b) => {
    if (a.name === cleanSym && b.name !== cleanSym) return -1;
    if (b.name === cleanSym && a.name !== cleanSym) return 1;
    return 0;
  });

  return validHits;
}

// ---------------------------------------------------------------- Workspace Indexing

/**
 * Scans workspace and builds/updates prefix-sharded symbol cache.
 */
export function indexWorkspace(workspaceRoot = process.cwd(), opts = {}) {
  const startTime = Date.now();
  const { cacheDir, workspaceRoot: root } = ensureCacheDirs(workspaceRoot);
  const { files, error } = collectFiles(root, CODE_EXT, opts);

  if (error || !files || files.length === 0) {
    return {
      indexedFiles: 0,
      totalSymbols: 0,
      bucketsCreated: 0,
      durationMs: Date.now() - startTime,
      error: error || "No files found",
    };
  }

  // Group all extracted symbols by prefix bucket to write each bucket exactly once
  const bucketMap = new Map();
  let totalSymbols = 0;
  let indexedFiles = 0;

  for (const absFile of files) {
    let stat;
    try {
      stat = fs.statSync(absFile);
      if (stat.size > 2_000_000) continue; // Skip files > 2MB
    } catch {
      continue;
    }

    let text;
    try {
      text = fs.readFileSync(absFile, "utf8");
    } catch {
      continue;
    }

    const relFile = path.relative(root, absFile).replace(/\\/g, "/");
    const symbols = extractFileSymbols(text);
    if (symbols.length === 0) continue;

    indexedFiles++;
    totalSymbols += symbols.length;

    for (const sym of symbols) {
      const prefix = getSymbolPrefix(sym.name);
      if (!bucketMap.has(prefix)) {
        bucketMap.set(prefix, loadBucket(cacheDir, prefix));
      }
      const bucket = bucketMap.get(prefix);
      if (!bucket.symbols) bucket.symbols = {};

      const key = sym.name.toLowerCase();
      if (!Array.isArray(bucket.symbols[key])) bucket.symbols[key] = [];

      bucket.symbols[key] = bucket.symbols[key].filter(
        (e) => !(e.file === relFile && e.line === sym.line)
      );

      bucket.symbols[key].push({
        name: sym.name,
        file: relFile,
        line: sym.line,
        kind: sym.kind,
        signature: sym.signature,
        mtime: stat.mtimeMs,
      });
    }
  }

  // Commit each bucket
  let bucketsCreated = 0;
  for (const [prefix, bucketData] of bucketMap.entries()) {
    if (saveBucket(cacheDir, prefix, bucketData)) {
      bucketsCreated++;
    }
  }

  return {
    indexedFiles,
    totalSymbols,
    bucketsCreated,
    durationMs: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------- Stats & Hygiene

/**
 * Returns cache statistics for the current workspace.
 */
export function getCacheStats(workspaceRoot = process.cwd()) {
  const { cacheDir } = getCachePaths(workspaceRoot);
  if (!fs.existsSync(cacheDir)) {
    return { bucketCount: 0, totalSymbols: 0, totalBytes: 0, cacheDir };
  }

  let bucketCount = 0;
  let totalSymbols = 0;
  let totalBytes = 0;

  try {
    const bucketFiles = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
    bucketCount = bucketFiles.length;

    for (const bf of bucketFiles) {
      const full = path.join(cacheDir, bf);
      try {
        const stat = fs.statSync(full);
        totalBytes += stat.size;
        const bucket = JSON.parse(fs.readFileSync(full, "utf8"));
        if (bucket.symbols) {
          for (const key of Object.keys(bucket.symbols)) {
            totalSymbols += bucket.symbols[key].length;
          }
        }
      } catch {}
    }
  } catch {}

  return {
    bucketCount,
    totalSymbols,
    totalBytes,
    cacheDir,
  };
}

/**
 * Clears all symbol cache bucket files, preserving .z-plugin/.gitignore.
 */
export function clearCache(workspaceRoot = process.cwd()) {
  const { cacheDir } = getCachePaths(workspaceRoot);
  if (!fs.existsSync(cacheDir)) return true;

  try {
    const files = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      try {
        fs.unlinkSync(path.join(cacheDir, f));
      } catch {}
    }
    MEM_BUCKETS.clear();
    return true;
  } catch {
    return false;
  }
}
