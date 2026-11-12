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

const COMMON_CALL_EXCLUDES = new Set([
  "console", "log", "warn", "error", "info", "debug",
  "parseInt", "parseFloat", "toString", "valueOf", "toJSON",
  "String", "Number", "Boolean", "Array", "Object", "Function", "Promise", "Task",
  "Math", "min", "max", "floor", "ceil", "round", "abs",
  "push", "pop", "shift", "unshift", "slice", "splice", "filter", "map", "reduce", "forEach",
  "split", "join", "replace", "replaceAll", "trim", "toLowerCase", "toUpperCase", "startsWith", "endsWith", "includes",
  "sizeof", "typeof", "nameof", "ArgumentNullException", "ArgumentException", "ArgumentOutOfRangeException", "InvalidOperationException",
  "Exception", "Delay", "FromResult", "Run", "Add", "Clear", "Contains", "Wait", "Result"
]);

const GUARD_RE = /\b(?:if\s*\(.*\)\s*(?:return\b|throw\b|\{\s*(?:return\b|throw\b))|Guard\.[A-Za-z0-9_]+|ThrowIfNull|ArgumentNullException\.)/i;
const TYPE_INST_RE = /\b(?:new\s+([A-Z][A-Za-z0-9_]+)\s*\(|([A-Z][A-Za-z0-9_]+)\s+[A-Za-z0-9_]+\s*=)/g;
const QUALIFIED_CALL_RE = /(?:this\.)?\b([A-Za-z_$][\w$]*)\s*(?:\?\.)?\.\s*([A-Za-z_$][\w$]*)\s*(?:<[^>]+>)?\s*\(/g;
const FIELD_DECL_RE = /\b(?:private|protected|public|internal|readonly)\s+(?:readonly\s+|static\s+)*([I]?[A-Z][A-Za-z0-9_]*)\s*(?:\?)?\s+([_a-zA-Z$][\w$]*)\s*[;=,)]/;
const TS_FIELD_DECL_RE = /\b(?:private|protected|public|readonly)\s+(?:readonly\s+)?([_a-zA-Z$][\w$]*)\s*\??\s*:\s*([I]?[A-Z][A-Za-z0-9_]*)/;
const COMMON_TYPE_EXCLUDES = new Set([
  "Task", "List", "Dictionary", "HashSet", "IEnumerable", "IList", "IReadOnlyList", "ICollection",
  "String", "Int32", "Int64", "Decimal", "Double", "Boolean", "Action", "Func", "Exception",
  "StringBuilder", "CancellationToken", "Object", "DateTime", "DateTimeOffset", "TimeSpan", "Guid"
]);

/**
 * Single-pass O(N) lexical masker (Shadow Masking).
 * Replaces characters inside comments (//, /* * /, <!-- -->, #) and string literals ("", '', ``)
 * with spaces while preserving exact line breaks (\r, \n), outer quotes, and character positions.
 * Eliminates brace-counting corruption and false-positive regex matches inside strings/comments.
 */
export function maskSourceCode(source) {
  if (!source || typeof source !== "string") return "";
  const len = source.length;
  const out = new Array(len);
  // States: 0=CODE, 1=LINE_COMMENT, 2=BLOCK_COMMENT, 3=HTML_COMMENT, 4=DBL_STR, 5=SGL_STR, 6=TPL_STR, 7=VERBATIM_STR
  let state = 0;
  let lineStart = true;

  for (let i = 0; i < len; i++) {
    const ch = source[i];
    const next = i + 1 < len ? source[i + 1] : "";

    if (ch === "\n") {
      out[i] = "\n";
      if (state === 1 || state === 4 || state === 5) state = 0;
      lineStart = true;
      continue;
    }
    if (ch === "\r") {
      out[i] = "\r";
      continue;
    }

    if (state === 1) {
      out[i] = " ";
      continue;
    }
    if (state === 2) {
      if (ch === "*" && next === "/") {
        out[i] = " ";
        out[i + 1] = " ";
        i++;
        state = 0;
      } else {
        out[i] = " ";
      }
      continue;
    }
    if (state === 3) {
      if (ch === "-" && next === "-" && source[i + 2] === ">") {
        out[i] = " ";
        out[i + 1] = " ";
        out[i + 2] = " ";
        i += 2;
        state = 0;
      } else {
        out[i] = " ";
      }
      continue;
    }
    if (state === 4) {
      if (ch === "\\" && i + 1 < len) {
        out[i] = " ";
        if (source[i + 1] !== "\n" && source[i + 1] !== "\r") {
          out[i + 1] = " ";
          i++;
        }
      } else if (ch === '"') {
        out[i] = '"';
        state = 0;
      } else {
        out[i] = " ";
      }
      continue;
    }
    if (state === 5) {
      if (ch === "\\" && i + 1 < len) {
        out[i] = " ";
        if (source[i + 1] !== "\n" && source[i + 1] !== "\r") {
          out[i + 1] = " ";
          i++;
        }
      } else if (ch === "'") {
        out[i] = "'";
        state = 0;
      } else {
        out[i] = " ";
      }
      continue;
    }
    if (state === 6) {
      if (ch === "\\" && i + 1 < len) {
        out[i] = " ";
        if (source[i + 1] !== "\n" && source[i + 1] !== "\r") {
          out[i + 1] = " ";
          i++;
        }
      } else if (ch === "`") {
        out[i] = "`";
        state = 0;
      } else {
        out[i] = " ";
      }
      continue;
    }
    if (state === 7) {
      if (ch === '"' && next === '"') {
        out[i] = " ";
        out[i + 1] = " ";
        i++;
      } else if (ch === '"') {
        out[i] = '"';
        state = 0;
      } else {
        out[i] = " ";
      }
      continue;
    }

    // state === 0 (NORMAL CODE)
    if (ch === "/" && next === "/") {
      out[i] = " ";
      out[i + 1] = " ";
      i++;
      state = 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      out[i] = " ";
      out[i + 1] = " ";
      i++;
      state = 2;
      continue;
    }
    if (ch === "<" && next === "!" && source[i + 2] === "-" && source[i + 3] === "-") {
      out[i] = " ";
      out[i + 1] = " ";
      out[i + 2] = " ";
      out[i + 3] = " ";
      i += 3;
      state = 3;
      continue;
    }
    if (ch === "#" && lineStart && next !== "[") {
      out[i] = " ";
      state = 1;
      continue;
    }
    if (ch === "@" && next === '"') {
      out[i] = " ";
      out[i + 1] = '"';
      i++;
      state = 7;
      lineStart = false;
      continue;
    }
    if (ch === '"') {
      out[i] = '"';
      state = 4;
      lineStart = false;
      continue;
    }
    if (ch === "'") {
      // Avoid masking Rust lifetime annotations like &'a or <'a>
      const prev = i > 0 ? source[i - 1] : "";
      if (prev === "&" || prev === "<" || prev === ":") {
        const closeQuote = source.indexOf("'", i + 1);
        const nextLine = source.indexOf("\n", i + 1);
        if (closeQuote === -1 || (nextLine !== -1 && closeQuote > nextLine) || closeQuote - i > 2) {
          out[i] = ch;
          lineStart = false;
          continue;
        }
      }
      out[i] = "'";
      state = 5;
      lineStart = false;
      continue;
    }
    if (ch === "`") {
      out[i] = "`";
      state = 6;
      lineStart = false;
      continue;
    }

    if (ch !== " " && ch !== "\t") {
      lineStart = false;
    }
    out[i] = ch;
  }

  return out.join("");
}

/**
 * Counts net parenthesis delta '(' minus ')' on a masked line.
 */
export function countParenDelta(maskedLine) {
  let delta = 0;
  for (let i = 0; i < maskedLine.length; i++) {
    const ch = maskedLine[i];
    if (ch === "(") delta++;
    else if (ch === ")") delta--;
  }
  return delta;
}

/**
 * Folds multi-line declarations when parentheses '(' remain unclosed across lines (up to maxFoldLines).
 */
export function foldSignatureLines(rawLines, maskedLines, startIdx, maxFoldLines = 10) {
  const firstMasked = maskedLines[startIdx] || "";
  let parenBalance = countParenDelta(firstMasked);
  let endSigIdx = startIdx;

  if (parenBalance > 0 && !firstMasked.includes(";")) {
    const limit = Math.min(rawLines.length - 1, startIdx + maxFoldLines);
    for (let k = startIdx + 1; k <= limit; k++) {
      endSigIdx = k;
      parenBalance += countParenDelta(maskedLines[k] || "");
      if (parenBalance <= 0) {
        // Also fold trailing '{' if on the very next line or current line
        break;
      }
    }
  } else if (
    startIdx + 1 < rawLines.length &&
    !firstMasked.includes("(") &&
    !firstMasked.includes("{") &&
    !firstMasked.includes(";") &&
    /^\s*(?:(?:public|private|protected|internal|static|sealed|abstract|partial|async|virtual|override|extern|unsafe|export|pub)\s+)+[\w.<>,[\]\s?*&:]+$/.test(firstMasked)
  ) {
    // Return type on line i, method name + params on line i+1..k
    const nextMasked = maskedLines[startIdx + 1] || "";
    if (/^\s*[A-Za-z_$][\w$]*\s*(?:<[^>]+>)?\s*\(/.test(nextMasked)) {
      endSigIdx = startIdx + 1;
      parenBalance = countParenDelta(nextMasked);
      const limit = Math.min(rawLines.length - 1, startIdx + maxFoldLines);
      while (parenBalance > 0 && endSigIdx < limit) {
        endSigIdx++;
        parenBalance += countParenDelta(maskedLines[endSigIdx] || "");
      }
    }
  }

  if (endSigIdx === startIdx) {
    return {
      combinedRaw: rawLines[startIdx].trim(),
      combinedMasked: firstMasked.trim(),
      endSigIdx: startIdx,
    };
  }

  const rawParts = [];
  const maskedParts = [];
  for (let k = startIdx; k <= endSigIdx; k++) {
    rawParts.push(rawLines[k].trim());
    maskedParts.push((maskedLines[k] || "").trim());
  }
  return {
    combinedRaw: rawParts.join(" "),
    combinedMasked: maskedParts.join(" "),
    endSigIdx,
  };
}

function registerReceiverType(map, rawName, rawType) {
  if (!rawName || !rawType || COMMON_TYPE_EXCLUDES.has(rawType) || KEYWORDS.has(rawType.toLowerCase())) return;
  const cleanVar = rawName.replace(/^this\./, "");
  map.set(cleanVar, rawType);
  if (!cleanVar.startsWith("_")) {
    map.set("_" + cleanVar, rawType);
  }
}

function extractCallsFromBody(rawLines, maskedLines, startLineIdx, bodyStartIdx, symName, classFieldTypes = null) {
  const calls = new Set();
  const declLine = maskedLines[startLineIdx] || "";
  const maxScanLines = 250;
  let endIdx = bodyStartIdx;
  let hasGuard = false;

  if (/=>[^;]+;/.test(declLine) || (/=>[^;]+;/.test(maskedLines[bodyStartIdx] || "") && !(maskedLines[bodyStartIdx] || "").includes("{"))) {
    endIdx = bodyStartIdx;
  } else {
    let braceCount = 0;
    let foundOpen = false;
    for (let j = startLineIdx; j < maskedLines.length && j - startLineIdx < maxScanLines; j++) {
      const line = maskedLines[j];
      for (let c = 0; c < line.length; c++) {
        const char = line[c];
        if (char === "{") {
          braceCount++;
          foundOpen = true;
        } else if (char === "}") {
          braceCount--;
          if (foundOpen && braceCount === 0) {
            endIdx = j;
            break;
          }
        }
      }
      if (foundOpen && braceCount === 0) break;
      endIdx = j;
    }
  }

  const localTypes = new Map(classFieldTypes ? classFieldTypes.entries() : []);
  const CALL_RE = /\b([A-Za-z_$][\w$]*)\s*\(/g;
  const CQRS_RE = /\b(?:Send|Publish|Dispatch|Raise)\s*(?:<[^>]+>)?\s*\(\s*(?:new\s+)?([A-Za-z0-9_]+)/g;
  const REFLECT_RE = /\.GetMethod\s*\(\s*["']([A-Za-z0-9_]+)["']\s*\)/g;
  const LOCAL_ASSIGN_RE = /\b([_a-zA-Z$][\w$]*)\s*=\s*new\s+([A-Z][A-Za-z0-9_]*)\s*\(/g;
  const FIELD_ASSIGN_RE = /(?:this\.)?\b([_a-zA-Z$][\w$]*)\s*=\s*([a-zA-Z$][\w$]*)\s*;/g;

  for (let k = startLineIdx; k <= endIdx; k++) {
    const maskedRow = maskedLines[k] || "";
    if (!maskedRow.trim()) continue;
    const rawRow = rawLines[k] || "";

    if (!hasGuard) {
      if (GUARD_RE.test(maskedRow)) {
        hasGuard = true;
      } else if (/^\s*if\s*\(/.test(maskedRow)) {
        for (let peek = k + 1; peek <= Math.min(k + 3, endIdx); peek++) {
          const nextRow = (maskedLines[peek] || "").trim();
          if (!nextRow || nextRow === "{" || nextRow === "}") continue;
          if (/^(?:return\b|throw\b|\{\s*(?:return\b|throw\b))/.test(nextRow)) {
            hasGuard = true;
          }
          break;
        }
      }
    }

    // Track local variable instantiation: var validator = new OrderValidator()
    let localMatch;
    while ((localMatch = LOCAL_ASSIGN_RE.exec(maskedRow)) !== null) {
      registerReceiverType(localTypes, localMatch[1], localMatch[2]);
    }

    // Track constructor field assignment: _inventoryGateway = inventoryGateway;
    if (classFieldTypes) {
      let assignMatch;
      while ((assignMatch = FIELD_ASSIGN_RE.exec(maskedRow)) !== null) {
        const lhs = assignMatch[1];
        const rhs = assignMatch[2];
        if (localTypes.has(rhs) && !classFieldTypes.has(lhs)) {
          classFieldTypes.set(lhs, localTypes.get(rhs));
          localTypes.set(lhs, localTypes.get(rhs));
        }
      }
    }

    // Qualified receiver call resolution: _inventoryGateway.ReserveStockAsync(...)
    let qualMatch;
    while ((qualMatch = QUALIFIED_CALL_RE.exec(maskedRow)) !== null) {
      const receiver = qualMatch[1];
      const method = qualMatch[2];
      if (
        method &&
        !KEYWORDS.has(method.toLowerCase()) &&
        !COMMON_CALL_EXCLUDES.has(method) &&
        localTypes.has(receiver)
      ) {
        const resolvedType = localTypes.get(receiver);
        calls.add(`${resolvedType}.${method}`);
        if (resolvedType.startsWith("I") && resolvedType.length > 2 && /^[A-Z]/.test(resolvedType[1])) {
          calls.add(`${resolvedType.slice(1)}.${method}`);
        }
      }
    }

    let match;
    while ((match = CALL_RE.exec(maskedRow)) !== null) {
      const called = match[1];
      if (called !== symName && !KEYWORDS.has(called.toLowerCase()) && !COMMON_CALL_EXCLUDES.has(called)) {
        calls.add(called);
        if (calls.size >= 40) break;
      }
    }
    let cqrsMatch;
    while ((cqrsMatch = CQRS_RE.exec(maskedRow)) !== null) {
      const cmd = cqrsMatch[1];
      if (cmd && !KEYWORDS.has(cmd.toLowerCase())) {
        calls.add(cmd);
        calls.add(cmd + "Handler");
        if (calls.size >= 40) break;
      }
    }
    let refMatch;
    while ((refMatch = REFLECT_RE.exec(rawRow)) !== null) {
      const refMethod = refMatch[1];
      if (refMethod && !KEYWORDS.has(refMethod.toLowerCase())) {
        calls.add(refMethod);
        if (calls.size >= 40) break;
      }
    }
    let instMatch;
    while ((instMatch = TYPE_INST_RE.exec(maskedRow)) !== null) {
      const tName = instMatch[1] || instMatch[2];
      if (tName && !KEYWORDS.has(tName.toLowerCase()) && !COMMON_TYPE_EXCLUDES.has(tName)) {
        calls.add(tName);
        if (calls.size >= 40) break;
      }
    }
    if (calls.size >= 40) break;
  }

  return { calls: Array.from(calls), hasGuard, endLine: endIdx + 1 };
}

/**
 * Extracts parameter identifiers and optional parameter type bindings from a method signature string.
 */
export function extractParamNames(signature, outTypeMap = null) {
  if (!signature || typeof signature !== "string") return [];
  const openIdx = signature.indexOf("(");
  if (openIdx === -1) return [];
  let depth = 0;
  let closeIdx = -1;
  for (let i = openIdx; i < signature.length; i++) {
    if (signature[i] === "(") depth++;
    else if (signature[i] === ")") {
      depth--;
      if (depth === 0) {
        closeIdx = i;
        break;
      }
    }
  }
  const inner = closeIdx !== -1 ? signature.slice(openIdx + 1, closeIdx) : signature.slice(openIdx + 1);
  if (!inner.trim()) return [];

  // Strip nested generic brackets <...> so commas inside Dictionary<string, int> don't split parameters
  let stripped = inner;
  while (/<[^<>]*>/.test(stripped)) {
    stripped = stripped.replace(/<[^<>]*>/g, "");
  }

  const rawParams = stripped.split(",");
  const params = [];
  for (const p of rawParams) {
    const trimmed = p.replace(/\[[^\]]*\]/g, "").trim();
    if (!trimmed) continue;

    // Check TS-style param: name: Type
    const tsMatch = trimmed.match(/^(?:(?:public|private|protected|readonly)\s+)*([A-Za-z_$][\w$]*)\s*\??\s*:\s*([A-Za-z_$][\w$]*)/);
    if (tsMatch) {
      const pName = tsMatch[1];
      const pType = tsMatch[2];
      if (!KEYWORDS.has(pName.toLowerCase())) {
        params.push(pName);
        if (outTypeMap) registerReceiverType(outTypeMap, pName, pType);
      }
      continue;
    }

    // C# / Java / Go / Python style param: [ref/out/in/params] [Type] name [= default]
    const noDefault = trimmed.replace(/\s*=.*$/, "").trim();
    const parts = noDefault.split(/\s+/);
    const lastPart = parts[parts.length - 1].replace(/[:=].*$/, "").trim();
    const cleanParam = lastPart.replace(/[^A-Za-z0-9_$]/g, "");
    if (cleanParam && !KEYWORDS.has(cleanParam.toLowerCase()) && cleanParam !== "self" && cleanParam !== "this") {
      params.push(cleanParam);
      if (outTypeMap && parts.length >= 2) {
        const rawType = parts[parts.length - 2].replace(/[^A-Za-z0-9_]/g, "");
        if (/^[A-Z]/.test(rawType)) {
          registerReceiverType(outTypeMap, cleanParam, rawType);
        }
      }
    }
  }
  return params;
}

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

const DIRTY_BUCKETS = new Map();

/**
 * Flushes any deferred dirty prefix buckets in memory to disk once per bucket.
 */
export function flushDirtyBuckets(workspaceRoot = process.cwd()) {
  const { cacheDir } = getCachePaths(workspaceRoot);
  const dirtySet = DIRTY_BUCKETS.get(cacheDir);
  if (!dirtySet || dirtySet.size === 0) return 0;

  let flushed = 0;
  for (const prefix of dirtySet) {
    const bucketKey = path.join(cacheDir, `${prefix}.json`);
    const bucketData = MEM_BUCKETS.get(bucketKey);
    if (bucketData && saveBucket(cacheDir, prefix, bucketData)) {
      flushed++;
    }
  }
  dirtySet.clear();
  return flushed;
}

/**
 * Extracts symbols (types, functions, methods, properties) from source text
 * using Shadow Masking, Multi-line Signature Folding, Scope Stack, and Receiver Type Resolution.
 */
export function extractFileSymbols(content) {
  if (!content || typeof content !== "string") return [];
  const rawLines = content.split(/\r?\n/);
  const maskedContent = maskSourceCode(content);
  const maskedLines = maskedContent.split(/\r?\n/);
  const symbols = [];
  const seenInFile = new Set();

  // Scope stack entry: { sym, openBraceDepth, seenOpenBrace, fieldTypes }
  const typeScopeStack = [];
  let braceDepth = 0;

  for (let i = 0; i < rawLines.length; i++) {
    const maskedLine = maskedLines[i] || "";
    const trimmedMasked = maskedLine.trim();

    if (trimmedMasked && !COMMENT_RE.test(trimmedMasked) && !CONTROL_RE.test(trimmedMasked)) {
      const activeScope = typeScopeStack.length > 0 ? typeScopeStack[typeScopeStack.length - 1] : null;
      const currentTypeSym = activeScope ? activeScope.sym : null;

      // Capture class field declarations for receiver type resolution
      if (activeScope) {
        const fieldMatch = maskedLine.match(FIELD_DECL_RE);
        if (fieldMatch) {
          registerReceiverType(activeScope.fieldTypes, fieldMatch[2], fieldMatch[1]);
        } else {
          const tsFieldMatch = maskedLine.match(TS_FIELD_DECL_RE);
          if (tsFieldMatch) {
            registerReceiverType(activeScope.fieldTypes, tsFieldMatch[1], tsFieldMatch[2]);
          }
        }
      }

      // Fold multi-line signatures when '(' is unclosed across lines
      const folded = foldSignatureLines(rawLines, maskedLines, i, 10);
      const checkLine = folded.combinedMasked;
      const rawSignature = folded.combinedRaw;

      let sym = null;

      // 1. Types: class, interface, struct, enum, record, trait, type
      const typeMatch = checkLine.match(/\b(?:class|interface|struct|enum|record|trait|type)\s+([A-Za-z_$][\w$]*)/);
      if (typeMatch && !KEYWORDS.has(typeMatch[1].toLowerCase())) {
        sym = {
          name: typeMatch[1],
          kind: "type",
          line: i + 1,
          endLine: i + 1,
          signature: rawLines[i].trim(),
          members: [],
          calls: [],
        };
        const fieldMap = new Map();
        // Extract primary constructor parameters if present on class/record signature
        if (checkLine.includes("(")) {
          extractParamNames(checkLine, fieldMap);
        }
        typeScopeStack.push({
          sym,
          openBraceDepth: braceDepth,
          seenOpenBrace: false,
          fieldTypes: fieldMap,
        });
      }

      // 2. Keyword functions: function, def, defp, defn, func, fn, sub, proc
      if (!sym) {
        const funcMatch = checkLine.match(/\b(?:function|def|defp|defn|func|fun|fn|sub|proc)\s+([A-Za-z_$][\w$]*)/);
        if (funcMatch && !KEYWORDS.has(funcMatch[1].toLowerCase())) {
          sym = { name: funcMatch[1], kind: "func", line: i + 1, signature: rawSignature };
        }
      }

      // 3. Arrow / assign functions: const/let/var Foo = ...
      if (!sym) {
        const arrowMatch = checkLine.match(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/);
        if (arrowMatch && !KEYWORDS.has(arrowMatch[1].toLowerCase())) {
          sym = { name: arrowMatch[1], kind: "func", line: i + 1, signature: rawSignature };
        }
      }

      // 4. Go method receiver: func (r *Receiver) MethodName(...)
      if (!sym) {
        const goMethodMatch = checkLine.match(/\bfunc\s*\([^)]+\)\s*([A-Za-z_$][\w$]*)\s*\(/);
        if (goMethodMatch && !KEYWORDS.has(goMethodMatch[1].toLowerCase())) {
          sym = { name: goMethodMatch[1], kind: "func", line: i + 1, signature: rawSignature };
        }
      }

      // 5. C# / Java / C++ methods (including multi-line and spaced generic return types)
      if (!sym) {
        const methodMatch = checkLine.match(
          /(?:public|private|protected|internal|static|virtual|override|async|sealed|extern)\s+(?:[\w.]+(?:<[\w\s,.<>[\]?*&]+>)?(?:\[\]|\?|\*|\&)?\s+)+([A-Za-z_$][\w$]*)\s*(?:<[^>]+>)?\s*\([^;]*\)/
        );
        if (methodMatch && !KEYWORDS.has(methodMatch[1].toLowerCase())) {
          sym = { name: methodMatch[1], kind: "method", line: i + 1, signature: rawSignature };
        }
      }

      // 5b. C# / Java constructors: public OrderProcessor(IInventoryGateway gateway)
      if (!sym && currentTypeSym) {
        const ctorMatch = checkLine.match(
          new RegExp(`^\\s*(?:public|private|protected|internal)\\s+(${currentTypeSym.name})\\s*\\([^;]*\\)`)
        );
        if (ctorMatch && activeScope) {
          extractParamNames(checkLine, activeScope.fieldTypes);
          extractCallsFromBody(rawLines, maskedLines, i, folded.endSigIdx, currentTypeSym.name, activeScope.fieldTypes);
        }
      }

      // 6. JS/TS class methods: calculateTotal(...) { or async getItems(...) { or constructor(...) {
      if (!sym) {
        const jsMethodMatch = checkLine.match(/^\s*(?:(?:public|private|protected|readonly|async|static|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::\s*[^{;]+)?\{/);
        if (jsMethodMatch && !KEYWORDS.has(jsMethodMatch[1].toLowerCase())) {
          if (jsMethodMatch[1] === "constructor") {
            if (activeScope) {
              extractParamNames(checkLine, activeScope.fieldTypes);
            }
          } else {
            sym = { name: jsMethodMatch[1], kind: "method", line: i + 1, signature: rawSignature };
          }
        }
      }

      // 7. C# Properties: public int Count { get; set; } or Count => ...
      if (!sym) {
        const propMatch = maskedLine.match(
          /(?:public|private|protected|internal|static|virtual|override)\s+(?:[\w.]+(?:<[\w\s,.<>[\]?*&]+>)?(?:\[\]|\?)?\s+)+([A-Za-z_$][\w$]*)\s*(?::\s*[\w<>[\],.?]+)?\s*(?:=>|\{\s*(?:get|set|init))/
        );
        if (propMatch && !KEYWORDS.has(propMatch[1].toLowerCase())) {
          sym = { name: propMatch[1], kind: "prop", line: i + 1, endLine: i + 1, signature: rawLines[i].trim() };
        }
      }

      // 8. Interface method declarations: Task<bool> ProcessOrder(...);
      if (!sym && currentTypeSym && /interface/i.test(currentTypeSym.signature)) {
        const ifaceMethodMatch = checkLine.match(
          /^\s*(?:public\s+)?(?:[\w.]+(?:<[\w\s,.<>[\]?*&]+>)?(?:\[\]|\?)?\s+)+([A-Za-z_$][\w$]*)\s*(?:<[^>]+>)?\s*\([^)]*\)\s*;/
        );
        if (ifaceMethodMatch && !KEYWORDS.has(ifaceMethodMatch[1].toLowerCase())) {
          sym = { name: ifaceMethodMatch[1], kind: "method", line: i + 1, endLine: folded.endSigIdx + 1, signature: rawSignature };
        }
      }

      if (sym) {
        const key = `${sym.name}:${sym.line}`;
        if (!seenInFile.has(key)) {
          seenInFile.add(key);
          if (sym.kind === "func" || sym.kind === "method") {
            const paramTypeMap = new Map(activeScope ? activeScope.fieldTypes.entries() : []);
            sym.params = extractParamNames(checkLine, paramTypeMap);
            if (activeScope) {
              for (const [kParam, vType] of paramTypeMap.entries()) {
                if (!activeScope.fieldTypes.has(kParam)) activeScope.fieldTypes.set(kParam, vType);
              }
            }
            const bodyData = extractCallsFromBody(rawLines, maskedLines, i, folded.endSigIdx, sym.name, paramTypeMap);
            sym.calls = bodyData.calls;
            sym.hasGuard = Boolean(bodyData.hasGuard);
            sym.endLine = bodyData.endLine;
            if (currentTypeSym && sym !== currentTypeSym) {
              sym.ownerType = currentTypeSym.name;
              if (!currentTypeSym.members) currentTypeSym.members = [];
              if (!currentTypeSym.members.includes(sym.name)) {
                currentTypeSym.members.push(sym.name);
              }
            }
          } else {
            sym.calls = [];
            sym.params = [];
            sym.hasGuard = false;
            if (!sym.endLine) sym.endLine = i + 1;
          }
          symbols.push(sym);
        }
      }
    }

    // Update braceDepth on maskedLine and pop closed type scopes
    for (let c = 0; c < maskedLine.length; c++) {
      const ch = maskedLine[c];
      if (ch === "{") {
        braceDepth++;
        for (let s = 0; s < typeScopeStack.length; s++) {
          if (braceDepth > typeScopeStack[s].openBraceDepth) {
            typeScopeStack[s].seenOpenBrace = true;
          }
        }
      } else if (ch === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
        while (typeScopeStack.length > 0) {
          const top = typeScopeStack[typeScopeStack.length - 1];
          if (top.seenOpenBrace && braceDepth <= top.openBraceDepth) {
            top.sym.endLine = i + 1;
            typeScopeStack.pop();
          } else {
            break;
          }
        }
      }
    }
  }

  // Close any remaining unclosed type scopes (e.g. Python indentation classes or EOF)
  while (typeScopeStack.length > 0) {
    const top = typeScopeStack.pop();
    top.sym.endLine = rawLines.length;
  }

  return symbols;
}

// ---------------------------------------------------------------- Store & Invalidate

/**
 * Stores extracted symbols for a specific file into corresponding prefix buckets.
 * Supports opts.deferFlush = true to batch disk writes across multi-file operations.
 */
export function storeSymbolsForFile(workspaceRoot, relFile, symbols, mtimeMs, opts = {}) {
  const normRel = relFile.replace(/\\/g, "/");
  const { cacheDir } = ensureCacheDirs(workspaceRoot);
  const deferFlush = Boolean(opts.deferFlush);

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
        endLine: sym.endLine || sym.line,
        ownerType: sym.ownerType || null,
        kind: sym.kind,
        signature: sym.signature,
        calls: sym.calls || [],
        members: sym.members || [],
        params: sym.params || [],
        hasGuard: Boolean(sym.hasGuard),
        mtime: mtimeMs,
      });
    }

    const bucketKey = path.join(cacheDir, `${prefix}.json`);
    touchMemBucket(bucketKey, bucket);

    if (deferFlush) {
      if (!DIRTY_BUCKETS.has(cacheDir)) DIRTY_BUCKETS.set(cacheDir, new Set());
      DIRTY_BUCKETS.get(cacheDir).add(prefix);
    } else {
      saveBucket(cacheDir, prefix, bucket);
    }
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
  const rawSym = String(symbolName || "").trim();
  if (!rawSym) return [];

  let ownerFilter = null;
  let cleanSym = rawSym;
  if (rawSym.includes(".")) {
    const parts = rawSym.split(".");
    cleanSym = parts.pop();
    ownerFilter = parts.pop().toLowerCase();
  }

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
    if (ownerFilter && item.ownerType) {
      const itemOwner = item.ownerType.toLowerCase();
      if (itemOwner !== ownerFilter && itemOwner !== "i" + ownerFilter && "i" + itemOwner !== ownerFilter) {
        continue;
      }
    }
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
          endLine: item.endLine || item.line,
          ownerType: item.ownerType || null,
          calls: item.calls || [],
          members: item.members || [],
          params: item.params || [],
          hasGuard: Boolean(item.hasGuard),
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
              endLine: reCheck.endLine || reCheck.line,
              ownerType: reCheck.ownerType || null,
              kind: reCheck.kind,
              signature: reCheck.signature,
              calls: reCheck.calls || [],
              members: reCheck.members || [],
              params: reCheck.params || [],
              hasGuard: Boolean(reCheck.hasGuard),
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
  const { files, error } = collectFiles(root, CODE_EXT, { cacheTtlMs: 0, ...opts });

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
        endLine: sym.endLine || sym.line,
        ownerType: sym.ownerType || null,
        kind: sym.kind,
        signature: sym.signature,
        calls: sym.calls || [],
        members: sym.members || [],
        params: sym.params || [],
        hasGuard: Boolean(sym.hasGuard),
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

// ---------------------------------------------------------------- Graphify: Call-Graph & Blast Radius

/**
 * Traces shortest call path from fromSymbol to toSymbol using BFS over prefix-sharded cache.
 * Returns: { found: boolean, path: string[], depth: number, durationMs: number, visitedNodes: number }
 */
export function tracePath(workspaceRoot = process.cwd(), fromSymbol, toSymbol, opts = {}) {
  const fromClean = String(fromSymbol || "").trim();
  const toClean = String(toSymbol || "").trim();
  if (!fromClean || !toClean) {
    return { found: false, error: "Both fromSymbol and toSymbol are required", path: [] };
  }

  if (fromClean.toLowerCase() === toClean.toLowerCase()) {
    return { found: true, path: [fromClean], depth: 0, durationMs: 0, visitedNodes: 1 };
  }

  const maxDepth = opts.maxDepth ?? 8;
  const queue = [{ name: fromClean, path: [fromClean], depth: 0 }];
  const visited = new Set([fromClean.toLowerCase()]);
  const startTime = Date.now();

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.depth >= maxDepth) continue;

    let candidates = lookupSymbol(workspaceRoot, current.name);

    // Polymorphic Interface Seam Stitching:
    // If current.name is an interface (e.g. IOrderService), also include concrete class candidates (OrderService)
    if (current.name.startsWith("I") && current.name.length > 2 && /^[A-Z]/.test(current.name[1])) {
      const concreteName = current.name.slice(1);
      const concreteCandidates = lookupSymbol(workspaceRoot, concreteName);
      if (concreteCandidates.length > 0) {
        candidates = [...candidates, ...concreteCandidates];
      }
    } else if (/(?:Service|Repository|Manager|Client|Store|Handler|Provider)$/.test(current.name)) {
      const ifaceName = "I" + current.name;
      const ifaceCandidates = lookupSymbol(workspaceRoot, ifaceName);
      if (ifaceCandidates.length > 0) {
        candidates = [...candidates, ...ifaceCandidates];
      }
    } else if (/(?:Command|Event|Notification|Query)$/.test(current.name)) {
      // CQRS / MediatR Seam Stitching
      const handlerName = current.name + "Handler";
      const hCandidates = lookupSymbol(workspaceRoot, handlerName);
      if (hCandidates.length > 0) {
        candidates = [...candidates, ...hCandidates];
      }
    }

    for (const cand of candidates) {
      const calls = [
        ...(cand.calls || []),
        ...(cand.kind === "type" ? (cand.members || []) : [])
      ];
      for (const callee of calls) {
        const calleeLower = callee.toLowerCase();
        if (calleeLower === toClean.toLowerCase()) {
          const fullPath = [...current.path, callee];
          return {
            found: true,
            path: fullPath,
            depth: fullPath.length - 1,
            durationMs: Date.now() - startTime,
            visitedNodes: visited.size,
          };
        }

        // CQRS / MediatR: Check if callee is a Command/Event leading to a Handler
        if (/(?:Command|Event|Notification|Query)$/.test(callee)) {
          const handlerName = callee + "Handler";
          if (handlerName.toLowerCase() === toClean.toLowerCase()) {
            const fullPath = [...current.path, callee, handlerName];
            return {
              found: true,
              path: fullPath,
              depth: fullPath.length - 1,
              durationMs: Date.now() - startTime,
              visitedNodes: visited.size,
            };
          }
          if (!visited.has(handlerName.toLowerCase())) {
            visited.add(handlerName.toLowerCase());
            queue.push({
              name: handlerName,
              path: [...current.path, callee, handlerName],
              depth: current.depth + 2,
            });
          }
        }

        // Check if callee is an interface (e.g. IInventoryService) that matches toClean concrete class (InventoryService)
        if (callee.startsWith("I") && callee.length > 2 && /^[A-Z]/.test(callee[1])) {
          const concreteCallee = callee.slice(1);
          if (concreteCallee.toLowerCase() === toClean.toLowerCase()) {
            const fullPath = [...current.path, callee, concreteCallee];
            return {
              found: true,
              path: fullPath,
              depth: fullPath.length - 1,
              durationMs: Date.now() - startTime,
              visitedNodes: visited.size,
            };
          }
          if (!visited.has(concreteCallee.toLowerCase())) {
            visited.add(concreteCallee.toLowerCase());
            queue.push({
              name: concreteCallee,
              path: [...current.path, callee, concreteCallee],
              depth: current.depth + 2,
            });
          }
        }

        if (!visited.has(calleeLower)) {
          visited.add(calleeLower);
          queue.push({
            name: callee,
            path: [...current.path, callee],
            depth: current.depth + 1,
          });
        }
      }
    }
  }

  return {
    found: false,
    path: [],
    depth: 0,
    durationMs: Date.now() - startTime,
    visitedNodes: visited.size,
  };
}

/**
 * Finds all functions/methods calling targetSymbol across the workspace symbol cache.
 * Returns array of: [{ caller: string, file: string, line: number, kind: string }]
 */
export function getCallers(workspaceRoot = process.cwd(), targetSymbol) {
  const cleanTarget = String(targetSymbol || "").trim().toLowerCase();
  if (!cleanTarget) return [];

  // Polymorphic targets: Check both concrete class and interface name
  const targets = new Set([cleanTarget]);
  if (targetSymbol.startsWith("I") && targetSymbol.length > 2 && /^[A-Z]/.test(targetSymbol[1])) {
    targets.add(targetSymbol.slice(1).toLowerCase());
  } else {
    targets.add(("i" + targetSymbol).toLowerCase());
  }

  const { cacheDir } = getCachePaths(workspaceRoot);
  if (!fs.existsSync(cacheDir)) return [];

  const callers = [];
  try {
    const bucketFiles = fs.readdirSync(cacheDir).filter((f) => f.endsWith(".json"));
    for (const bf of bucketFiles) {
      const bucket = loadBucket(cacheDir, bf.replace(".json", ""));
      if (!bucket.symbols) continue;

      for (const symKey of Object.keys(bucket.symbols)) {
        const entries = bucket.symbols[symKey];
        if (!Array.isArray(entries)) continue;

        for (const entry of entries) {
          if (Array.isArray(entry.calls)) {
            if (entry.calls.some((c) => targets.has(c.toLowerCase()))) {
              callers.push({
                caller: entry.name,
                file: entry.file,
                line: entry.line,
                kind: entry.kind,
              });
            }
          }
        }
      }
    }
  } catch {}

  // Deduplicate callers
  const unique = [];
  const seen = new Set();
  for (const c of callers) {
    const k = `${c.caller}:${c.file}:${c.line}`;
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(c);
    }
  }

  return unique;
}

/**
 * Calculates the blast radius (upstream callers, downstream callees, and impacted files)
 * for a modified symbol. Identifies if the symbol is a "God Node" (high centrality).
 */
export function getBlastRadius(workspaceRoot = process.cwd(), targetSymbol, opts = {}) {
  const cleanTarget = String(targetSymbol || "").trim();
  if (!cleanTarget) return { error: "targetSymbol is required" };

  const startTime = Date.now();
  const maxDepth = opts.maxDepth ?? 3;

  // 1. Direct callees (what this symbol calls)
  let hits = lookupSymbol(workspaceRoot, cleanTarget);
  if (cleanTarget.startsWith("I") && cleanTarget.length > 2 && /^[A-Z]/.test(cleanTarget[1])) {
    const concreteHits = lookupSymbol(workspaceRoot, cleanTarget.slice(1));
    hits = [...hits, ...concreteHits];
  } else {
    const ifaceHits = lookupSymbol(workspaceRoot, "I" + cleanTarget);
    hits = [...hits, ...ifaceHits];
  }
  const directCallees = new Set();
  const definingFiles = new Set();

  for (const h of hits) {
    definingFiles.add(h.file);
    if (Array.isArray(h.calls)) {
      for (const c of h.calls) directCallees.add(c);
    }
  }

  // 2. Upstream callers traversal (BFS to find all transitively dependent symbols)
  const queue = [{ name: cleanTarget, depth: 0 }];
  const visitedCallers = new Set([cleanTarget.toLowerCase()]);
  const impactedSymbols = new Set([cleanTarget]);
  const impactedFiles = new Set([...definingFiles]);
  const callerEdges = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.depth >= maxDepth) continue;

    const callers = getCallers(workspaceRoot, current.name);
    for (const c of callers) {
      impactedSymbols.add(c.caller);
      impactedFiles.add(c.file);
      callerEdges.push({ from: c.caller, to: current.name, file: c.file });

      const cLower = c.caller.toLowerCase();
      if (!visitedCallers.has(cLower)) {
        visitedCallers.add(cLower);
        queue.push({ name: c.caller, depth: current.depth + 1 });
      }
    }
  }

  const inDegree = getCallers(workspaceRoot, cleanTarget).length;
  const outDegree = directCallees.size;
  const totalDegree = inDegree + outDegree;
  const isGodNode = totalDegree >= 8;
  const riskScore = Math.min(100, Math.round(
    (inDegree * 10) + (outDegree * 5) + (impactedFiles.size * 6)
  ));

  return {
    symbol: cleanTarget,
    definingFiles: Array.from(definingFiles),
    inDegree,
    outDegree,
    totalDegree,
    isGodNode,
    riskScore,
    directCallees: Array.from(directCallees),
    impactedSymbols: Array.from(impactedSymbols),
    impactedFiles: Array.from(impactedFiles),
    edges: callerEdges,
    durationMs: Date.now() - startTime,
  };
}

// ---------------------------------------------------------------- Data-Flow & Taint Tracking

export const SENSITIVE_SINKS = {
  SQL_INJECTION: [
    "ExecuteSql", "ExecuteSqlRaw", "FromSqlRaw", "ExecuteAsync",
    "ExecuteNonQuery", "ExecuteReader", "SqlQuery", "rawQuery"
  ],
  COMMAND_INJECTION: [
    "Process.Start", "exec", "execSync", "spawn", "fork"
  ],
  PATH_TRAVERSAL: [
    "File.Open", "File.ReadAllText", "File.WriteAllText", "File.Delete",
    "readFileSync", "writeFileSync", "unlinkSync"
  ],
  WEAK_CRYPTO: [
    "MD5.Create", "SHA1.Create", "DES.Create"
  ]
};

const SANITIZER_PATTERNS = [
  /validate/i, /sanitize/i, /clean/i, /parse/i, /regex/i, /guard/i, /check/i
];

/**
 * Traces inter-procedural data-flow from an entry symbol down to sensitive sinks.
 * Identifies if unvalidated data flows into database, process, or file sinks.
 */
export function traceDataFlow(workspaceRoot = process.cwd(), entrySymbol, opts = {}) {
  const cleanEntry = String(entrySymbol || "").trim();
  if (!cleanEntry) return { error: "entrySymbol is required" };

  const startTime = Date.now();
  const maxDepth = opts.maxDepth ?? 8;
  const targetSinks = opts.sinks || Object.keys(SENSITIVE_SINKS);

  // Flatten sink triggers for fast lookup
  const sinkMap = new Map();
  for (const [sinkType, methods] of Object.entries(SENSITIVE_SINKS)) {
    if (!targetSinks.includes(sinkType) && !targetSinks.includes("ALL")) continue;
    for (const m of methods) {
      sinkMap.set(m.toLowerCase(), { sinkType, method: m });
    }
  }

  const hits = lookupSymbol(workspaceRoot, cleanEntry);
  const entryParams = hits.length > 0 ? (hits[0].params || []) : [];

  const queue = [{ name: cleanEntry, path: [cleanEntry], depth: 0, sanitized: false, sanitizeReason: null }];
  const visited = new Set([cleanEntry.toLowerCase()]);
  const discoveredSinks = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.depth >= maxDepth) continue;

    let candidates = lookupSymbol(workspaceRoot, current.name);
    // Polymorphic and CQRS stitching:
    if (current.name.startsWith("I") && current.name.length > 2 && /^[A-Z]/.test(current.name[1])) {
      const concreteCandidates = lookupSymbol(workspaceRoot, current.name.slice(1));
      if (concreteCandidates.length > 0) candidates = [...candidates, ...concreteCandidates];
    } else if (/(?:Command|Event|Notification)$/.test(current.name)) {
      const hCandidates = lookupSymbol(workspaceRoot, current.name + "Handler");
      if (hCandidates.length > 0) candidates = [...candidates, ...hCandidates];
    }

    for (const cand of candidates) {
      const hasGuardClause = Boolean(cand.hasGuard);
      const callees = [
        ...(cand.calls || []),
        ...(cand.kind === "type" ? (cand.members || []) : [])
      ];

      for (const callee of callees) {
        const calleeLower = callee.toLowerCase();
        const isSanitizerCall = SANITIZER_PATTERNS.some(re => re.test(callee));
        const currentSanitized = current.sanitized || isSanitizerCall || hasGuardClause;
        const currentReason = current.sanitizeReason || (hasGuardClause ? "guard" : (isSanitizerCall ? "sanitizer" : null));

        if (sinkMap.has(calleeLower)) {
          const { sinkType, method } = sinkMap.get(calleeLower);
          const isGuardProtected = currentReason === "guard" || hasGuardClause;
          discoveredSinks.push({
            sinkType,
            sinkMethod: method,
            file: cand.file,
            path: [...current.path, callee],
            depth: current.depth + 1,
            isTainted: !currentSanitized,
            hazard: currentSanitized
              ? (isGuardProtected ? "Reachable sink protected by branch guard clause" : "Reachable sink with detected sanitizer")
              : `Untrusted data-flow from '${cleanEntry}' reaches '${sinkType}' without explicit validation.`
          });
        }

        if (!visited.has(calleeLower)) {
          visited.add(calleeLower);
          queue.push({
            name: callee,
            path: [...current.path, callee],
            depth: current.depth + 1,
            sanitized: currentSanitized,
            sanitizeReason: currentReason,
          });
        }
      }
    }
  }

  return {
    source: cleanEntry,
    params: entryParams,
    reachableSinksCount: discoveredSinks.length,
    taintedSinksCount: discoveredSinks.filter(s => s.isTainted).length,
    sinks: discoveredSinks,
    durationMs: Date.now() - startTime,
  };
}
