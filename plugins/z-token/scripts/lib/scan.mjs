// Outline and search over the shared filesystem layer.
//
// - search() is language-agnostic: text search over every non-binary file under
//   the target, honouring .gitignore, with a short-TTL file index and an LRU
//   text cache.
// - outline() is heuristic, not a parser. It recognises declaration shapes for
//   C-family, JS/TS, Python, Ruby, PHP, Go, Rust, Swift/Kotlin, Scala, Dart,
//   shell, Lua, Perl and SQL. False negatives are expected for exotic syntax;
//   the caller can always fall back to Read with offset/limit.

import fs from "node:fs";
import path from "node:path";
import { collectFiles, readTextCached } from "./fsindex.mjs";

const CODE_EXT = new Set([
  ".cs", ".fs", ".vb", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".java", ".kt", ".kts", ".scala", ".groovy", ".py", ".rb", ".php",
  ".go", ".rs", ".swift", ".c", ".h", ".cpp", ".cc", ".cxx", ".hpp", ".hh",
  ".m", ".mm", ".lua", ".pl", ".pm", ".r", ".jl", ".dart", ".ex", ".exs",
  ".erl", ".hrl", ".hs", ".clj", ".cljs", ".sh", ".bash", ".zsh", ".ps1", ".psm1",
  ".sql", ".vue", ".svelte", ".astro", ".zig", ".nim", ".sol",
  ".tf", ".hcl", ".proto", ".graphql", ".gql", ".xaml",
]);

// ---------------------------------------------------------------- outline

const COMMENT_RE = /^\s*(?:\/\/|#(?!\[)|--|\*|\/\*|<!--)/;
const CONTROL_RE = /^\s*(?:if|for|while|switch|catch|return|new|using|lock|foreach|do|else|try|throw|await|yield|case|default|break|continue|goto|sizeof|typeof|nameof|assert|raise|pass|del|import|from|require|include|echo|print|puts)\b/;

const PATTERNS = [
  { kind: "ns", re: /^\s*(?:namespace|package|module|defmodule)\s+[A-Za-z_$@]/ },
  {
    kind: "type",
    re: /^\s*(?:\[[^\]]*\]\s*)*(?:(?:public|private|protected|internal|static|sealed|abstract|partial|readonly|async|virtual|override|new|extern|unsafe|const|event|required|file|scoped|ref|pub|export|default|declare|inline|final|open|data|value|case|actor)\s+)*(?:class|interface|struct|enum|record|delegate|trait|impl|object|protocol|contract|extension|union|type)\b/,
  },
  {
    kind: "func",
    re: /^\s*(?:(?:export|default|pub(?:\([^)]*\))?|async|static|inline|unsafe|extern|public|private|protected|internal|local|constexpr|virtual|override)\s+)*(?:function|def|defp|defn|func|fun|fn|sub|proc|method|constructor|task)\b/,
  },
  { kind: "sql", re: /^\s*CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?(?:TABLE|PROCEDURE|PROC|FUNCTION|VIEW|INDEX|TRIGGER|TYPE|SCHEMA|DATABASE)\b/i },
  {
    kind: "func",
    re: /^\s*(?:export\s+)?(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>|class\b)/,
  },
  { kind: "func", re: /^\s*(?:function\s+[A-Za-z_][\w-]*|[A-Za-z_][\w-]*\s*\(\)\s*\{)/ },
  {
    kind: "method",
    re: /^\s*(?:(?:public|private|protected|internal|static|sealed|abstract|partial|async|virtual|override|extern|unsafe|new|synchronized|final|native|default)\s+)+[\w<>[\],.?*&:~]+\s+[A-Za-z_]\w*\s*(?:<[^>]*>)?\s*\(/,
  },
  // Unmodified members: JS/TS class methods and object methods (`run() {`,
  // `async load(): Promise<void> {`).
  {
    kind: "method",
    re: /^\s*(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?[A-Za-z_$][\w$]*\s*\([^)]*\)\s*(?::\s*[^{]+)?\{/,
  },
  {
    kind: "prop",
    re: /^\s*(?:(?:public|private|protected|internal|static|readonly|virtual|override|required|lateinit|const)\s+)+[\w<>[\],.?]+\s+[A-Za-z_]\w*\s*(?::\s*[\w<>[\],.?]+)?\s*(?:=|\{\s*(?:get|set|init))/,
  },
  // Return-type declarations with no modifiers: C, Go, Dart, old-style Java.
  {
    kind: "func",
    re: /^\s*(?:[\w:*&<>,[\].]+\s+)+[*&]?\s*[A-Za-z_]\w*\s*\([^;{}]*\)\s*(?:const)?\s*\{?\s*$/,
  },
];

function symbolKind(line) {
  if (!line.trim()) return null;
  if (COMMENT_RE.test(line)) return null;
  if (CONTROL_RE.test(line)) return null;
  for (const p of PATTERNS) if (p.re.test(line)) return p.kind;
  return null;
}

export function outline(target, opts = {}) {
  if (opts.symbol) {
    return readSymbol(target, opts.symbol, opts);
  }
  const maxFiles = opts.maxFiles ?? 10;
  const maxPerFile = opts.maxPerFile ?? 60;
  const { files, error } = collectFiles(target, CODE_EXT, opts);
  if (error) return { text: error, stats: { files: 0, symbols: 0 } };
  if (files.length === 0) {
    return { text: `No source files under ${target}`, stats: { files: 0, symbols: 0 } };
  }

  const sized = files
    .map((f) => {
      try {
        return { f, stat: fs.statSync(f) };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.stat.size - a.stat.size);

  const selected = sized.slice(0, maxFiles);
  const lines = [];
  let symbols = 0;

  for (const { f, stat } of selected) {
    const text = readTextCached(f, stat, opts.cacheMaxBytes);
    if (text === null) continue;
    const rows = text.split(/\r?\n/);
    const rel = path.relative(process.cwd(), f) || f;
    const found = [];
    for (let i = 0; i < rows.length; i++) {
      if (symbolKind(rows[i])) found.push(`${String(i + 1).padStart(5)}  ${rows[i].trim().slice(0, 160)}`);
      if (found.length > maxPerFile) break;
    }
    if (found.length === 0) continue;
    symbols += found.length;
    lines.push(`${rel} (${rows.length} lines)`);
    lines.push(...found.slice(0, maxPerFile));
    if (found.length > maxPerFile) lines.push(`      ... more symbols omitted`);
    lines.push("");
  }

  const body = lines.join("\n").trimEnd();
  const skipped = sized.length - selected.length;
  const header =
    `Outline: ${selected.length} file(s), ${symbols} symbols` +
    (skipped > 0 ? `, ${skipped} smaller file(s) not shown (raise maxFiles)` : "");
  return { text: `${header}\n\n${body}`, stats: { files: selected.length, symbols } };
}

// ---------------------------------------------------------------- readSymbol (One-Shot Method Inspection)

export function readSymbol(target, symbolName, opts = {}) {
  const cleanSym = String(symbolName || "").trim();
  if (!cleanSym) {
    return { text: "readSymbol: symbol parameter is required", error: true };
  }

  const fullPath = path.isAbsolute(target) ? target : path.resolve(process.cwd(), target);
  if (!fs.existsSync(fullPath)) {
    return { text: `Target file not found: ${target}`, error: true };
  }

  let text = "";
  try {
    text = fs.readFileSync(fullPath, "utf8");
  } catch (e) {
    return { text: `Failed to read ${target}: ${e.message}`, error: true };
  }

  const rows = text.split(/\r?\n/);
  const symRe = new RegExp(`\\b${cleanSym}\\b`);

  let declIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const line = rows[i];
    if (COMMENT_RE.test(line)) continue;
    if (symRe.test(line) && (symbolKind(line) || /\b(?:def|function|class|interface|record|struct|enum)\b/.test(line) || /\(.*\)/.test(line))) {
      declIdx = i;
      break;
    }
  }

  if (declIdx === -1) {
    for (let i = 0; i < rows.length; i++) {
      if (COMMENT_RE.test(rows[i])) continue;
      if (new RegExp(`\\b${cleanSym}\\s*\\(`).test(rows[i])) {
        declIdx = i;
        break;
      }
    }
  }

  if (declIdx === -1) {
    return {
      text: `Symbol '${cleanSym}' not found in ${path.basename(target)}. Run 'outline' without symbol to view all available declarations in this file.`,
      found: false
    };
  }

  // Scan backwards for decorators, attributes, or doc comments (up to 6 lines)
  let startIdx = declIdx;
  while (startIdx > 0) {
    const prev = rows[startIdx - 1].trim();
    if (/^\s*(?:\[[^\]]+\]|@\w+|(?:\/\/|#|\*|\/\*\*|\/\/\/))/.test(prev)) {
      startIdx--;
    } else {
      break;
    }
  }

  const ext = path.extname(target).toLowerCase();
  const isPython = ext === ".py";

  let endIdx = declIdx;
  if (isPython) {
    const declIndent = rows[declIdx].match(/^\s*/)[0].length;
    for (let j = declIdx + 1; j < rows.length; j++) {
      const line = rows[j];
      if (!line.trim()) continue;
      const lineIndent = line.match(/^\s*/)[0].length;
      if (lineIndent <= declIndent) {
        endIdx = j - 1;
        break;
      }
      endIdx = j;
    }
  } else {
    const declLine = rows[declIdx];
    if (/=>[^;]+;/.test(declLine)) {
      endIdx = declIdx;
    } else {
      let braceCount = 0;
      let foundOpen = false;
      for (let j = declIdx; j < rows.length; j++) {
        const line = rows[j];
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
        if (foundOpen && braceCount === 0) {
          endIdx = j;
          break;
        }
        if (j - declIdx > 350) {
          endIdx = j;
          break;
        }
      }
    }
  }

  const padBefore = Math.max(0, startIdx - 1);
  const padAfter = Math.min(rows.length - 1, endIdx + 1);

  const extractedLines = [];
  for (let k = padBefore; k <= padAfter; k++) {
    extractedLines.push(`${String(k + 1).padStart(5)}  ${rows[k]}`);
  }

  const header = `// One-Shot Symbol: ${cleanSym} (${path.basename(target)}#L${startIdx + 1}-L${endIdx + 1}, ${endIdx - startIdx + 1} lines)`;
  return {
    text: `${header}\n\n${extractedLines.join("\n")}`,
    found: true,
    symbol: cleanSym,
    startLine: startIdx + 1,
    endLine: endIdx + 1,
    lineCount: endIdx - startIdx + 1
  };
}

// ---------------------------------------------------------------- search

export function search(opts) {
  const pattern = String(opts.pattern ?? "");
  if (!pattern) return { text: "search: pattern is required", stats: { matches: 0 } };
  const maxMatches = Math.min(opts.maxMatches ?? 30, 200);
  const context = Math.min(opts.context ?? 2, 5);
  const maxBytes = opts.maxBytes ?? 8192;

  let re;
  const m = pattern.match(/^\/(.*)\/([gimsuy]*)$/);
  try {
    re = m ? new RegExp(m[1], m[2].replace("g", "")) : new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  } catch (e) {
    return { text: `search: invalid pattern (${e.message})`, stats: { matches: 0 } };
  }

  const target = opts.path || ".";
  const allow = Array.isArray(opts.extensions) && opts.extensions.length > 0 ? opts.extensions : null;
  const { files, error } = collectFiles(target, allow, opts);
  if (error) return { text: error, stats: { matches: 0 } };

  const out = [];
  let matches = 0;
  let totalMatches = 0;
  const hitFiles = new Set();
  let bytes = 0;
  let stoppedEarly = false;

  for (const f of files) {
    if (stoppedEarly) break;
    let stat;
    try {
      stat = fs.statSync(f);
      if (stat.size > 2_000_000) continue;
    } catch {
      continue;
    }
    const text = readTextCached(f, stat, opts.cacheMaxBytes);
    if (text === null) continue;
    const rows = text.split(/\r?\n/);
    const rel = path.relative(process.cwd(), f) || f;
    for (let i = 0; i < rows.length; i++) {
      const hit = re.test(rows[i]);
      re.lastIndex = 0;
      if (!hit) continue;
      totalMatches++;
      if (matches >= maxMatches) continue;
      matches++;
      hitFiles.add(rel);
      const from = Math.max(0, i - context);
      const to = Math.min(rows.length - 1, i + context);
      for (let j = from; j <= to; j++) {
        const prefix = j === i ? `${rel}:${j + 1}: ` : `  ${j + 1}| `;
        const line = prefix + rows[j].slice(0, 240);
        bytes += line.length + 1;
        out.push(line);
      }
      out.push("");
      if (bytes >= maxBytes) {
        stoppedEarly = true;
        break;
      }
    }
  }

  // A byte-cap stop means the scan never finished, so the count is a lower bound.
  const header = stoppedEarly
    ? `Found at least ${totalMatches} match(es); output cap (${Math.round(maxBytes / 1024)} KB) reached after ` +
      `${hitFiles.size} file(s), showing ${matches}. Narrow the pattern or reduce context.`
    : `Found ${totalMatches} match(es) in ${hitFiles.size} file(s)` +
      (totalMatches > matches ? `, showing ${matches} (capped; narrow the pattern or set maxMatches)` : "");
  if (out.length === 0) return { text: `${header}\nNo matching lines.`, stats: { matches: 0 } };
  return { text: `${header}\n\n${out.join("\n").trimEnd()}`, stats: { matches } };
}
