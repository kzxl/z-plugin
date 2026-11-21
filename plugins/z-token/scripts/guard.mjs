#!/usr/bin/env node
// PreToolUse guard: blocks tool calls whose result would flood the context.
// Contract: stdin = hook payload JSON, stdout = hook output JSON (or nothing), exit 0.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./lib/config.mjs";
import { appendLedger } from "./lib/ledger.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function readStdin() {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (raw += c));
    process.stdin.on("end", () => resolve(raw));
    process.stdin.on("error", () => resolve(raw));
  });
}

function fileSize(p) {
  try {
    const st = fs.statSync(p);
    return st.isFile() ? st.size : -1;
  } catch {
    return -1;
  }
}

// Resolve a possibly relative path from a hook payload. Accepts Git-Bash style
// "/c/Users/..." in addition to native Windows paths.
function resolveExisting(p, cwd) {
  const candidates = [];
  const msys = String(p).match(/^\/([a-zA-Z])\/(.*)$/);
  if (msys) candidates.push(`${msys[1].toUpperCase()}:/${msys[2]}`);
  candidates.push(path.resolve(cwd || process.cwd(), p));
  candidates.push(path.resolve(p));
  for (const c of candidates) {
    if (fileSize(c) >= 0) return c;
  }
  return candidates[0];
}

function approxLines(bytes) {
  return Math.round(bytes / 38);
}

function respond(isAntigravity, decision, reason = "") {
  if (isAntigravity) {
    const out = reason ? { decision, reason } : { decision };
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  }
  if (decision === "deny") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        },
      })
    );
  }
  process.exit(0);
}

function deny(reason, meta = {}, isAntigravity = false) {
  appendLedger({ t: "deny", event: meta.event || "unknown", bytes: meta.bytes || 0, file: meta.file || "", reason });
  respond(isAntigravity, "deny", reason);
}

function checkLoopAntigravity(cfg, ev, tool, input) {
  const lb = cfg.loopBreaker || {};
  if (lb.enabled === false || !tool) return null;
  const threshold = lb.threshold ?? 3;
  const rawSession = ev.conversationId || ev.session_id || ev.sessionId || ev.conversation_id || "default";
  const session = String(rawSession).replace(/[^\w.-]/g, "_");
  const fingerprint = crypto
    .createHash("sha1")
    .update(tool + "\u0000" + JSON.stringify(input ?? {}))
    .digest("hex")
    .slice(0, 16);

  const dir = path.join(os.tmpdir(), "zero-token");
  const file = path.join(dir, `loops-${session}.json`);
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}

  const entry = state[fingerprint] || { tool, count: 0, warned: false };
  entry.count += 1;
  entry.tool = tool;
  state[fingerprint] = entry;

  const keys = Object.keys(state);
  if (keys.length > 200) {
    for (const k of keys.slice(0, keys.length - 200)) delete state[k];
  }
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state));
  } catch {}

  if (entry.count >= threshold && !entry.warned) {
    entry.warned = true;
    try {
      fs.writeFileSync(file, JSON.stringify(state));
    } catch {}
    return (
      `zero-token: this exact ${tool} call has now run ${threshold} times with identical input. ` +
      `Repeating it will not produce a different result. Change the input, narrow the target, or report what is missing instead of retrying.`
    );
  }
  return null;
}

// Flatten every path-looking argument, not just the last one.
// Command text inside a heredoc body or a quoted string is data, not a command.
// Matching raw shell text blocked commits and scripts that merely mentioned
// "git log -p" or "grep -rn".
function stripHeredocs(command) {
  return command.replace(/<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s*(?:\n|$))/g, " ");
}

function stripQuoted(s) {
  return s.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""');
}

function pathArgs(command) {
  const tokens = command.match(/"[^"]+"|'[^']+'|\S+/g) || [];
  const out = [];
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i].replace(/^["']|["']$/g, "");
    if (!t) continue;
    if (/^[|&>]/.test(t)) break;
    if (t.startsWith("-")) continue;
    if (/^\d+$/.test(t)) continue;
    out.push(t);
  }
  return out;
}

// A 128 KB minified bundle is far more expensive than a 128 KB source file:
// few lines, very long ones. Lower the budget when the file looks minified.
function isMinified(file, size) {
  if (/\.min\.(js|css)$/i.test(file)) return true;
  if (size < 20000) return false;
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(4096);
    const n = fs.readSync(fd, buf, 0, 4096, 0);
    fs.closeSync(fd);
    if (n < 500) return false;
    let nl = 0;
    for (let i = 0; i < n; i++) if (buf[i] === 10) nl++;
    return nl <= 3;
  } catch {
    return false;
  }
}

function effectiveMax(file, size, maxBytes) {
  return isMinified(file, size) ? Math.floor(maxBytes / 4) : maxBytes;
}

async function main() {
  const raw = await readStdin();
  let ev;
  try {
    ev = JSON.parse(raw || "{}");
  } catch {
    return;
  }

  const isAntigravity = Boolean(ev.toolCall || ev.hookEventName || ev.workspacePaths);
  const cwd = ev.cwd || ev.workspacePaths?.[0] || process.cwd();
  const cfg = loadConfig(here, cwd);
  const g = cfg.guard || {};
  if (g.enabled === false) {
    if (isAntigravity) respond(true, "allow");
    return;
  }

  const tool = ev.toolCall?.name || ev.tool_name || ev.toolName || "";
  const input = ev.toolCall?.args || ev.tool_input || {};

  // --- Read without a usable limit on a large file --------------------------
  // Supports ZCode/Claude Code ("Read", file_path, limit) and Antigravity ("read_file", Path, StartLine, EndLine)
  const isRead = tool === "Read" || tool === "read_file";
  if (isRead) {
    const r = g.read || {};
    const maxBytes = r.maxBytes ?? 131072;
    const maxLimitLines = r.maxLimitLines ?? 400;
    const p = input.file_path || input.Path || input.path;
    let limit = typeof input.limit === "number" ? input.limit : null;
    if (limit === null && typeof input.StartLine === "number" && typeof input.EndLine === "number") {
      limit = Math.max(1, input.EndLine - input.StartLine + 1);
    }
    const hasLimit = limit !== null && limit > 0;
    const tooBig = hasLimit && limit > maxLimitLines;
    if (p && (!hasLimit || tooBig)) {
      const full = resolveExisting(p, cwd);
      const size = fileSize(full);
      const budget = effectiveMax(full, size, maxBytes);
      if (size > budget) {
        const name = path.basename(p);
        const kb = Math.round(size / 1024);
        const lines = approxLines(size);
        const approxK = Math.round(size / 3.6 / 1000);
        const compact = budget < maxBytes ? ` It looks minified, so the read budget is ${Math.round(budget / 1024)} KB.` : "";
        const reason = tooBig
          ? `zero-token blocked ${tool} with limit=${limit}: on ${name} (${kb} KB) that is effectively a full read (~${approxK}k tokens).${compact} ` +
            `Use limit<=${maxLimitLines} with an offset, or the zero-token "outline" tool.`
          : `zero-token blocked a full read of ${name} (${kb} KB, ~${lines} lines): roughly ${approxK}k tokens.${compact} ` +
            `Use limit<=${maxLimitLines} with an offset, or the zero-token "outline" tool; ` +
            `if you have no MCP tools, locate what you need with grep -n -m 20 "<symbol>" ${name}.`;
        deny(reason, { event: "read", bytes: size, file: name }, isAntigravity);
      }
    }
  }

  // --- Bash / Terminal commands that dump unbounded output ------------------
  // Supports ZCode/Claude Code ("Bash", command) and Antigravity ("run_command", CommandLine)
  const isCommand = tool === "Bash" || tool === "run_command" || tool === "Terminal" || tool === "execute_command";
  if (isCommand) {
    const b = g.bash || {};
    if (b.enabled !== false) {
      const cmd = String(input.command || input.CommandLine || input.cmd || "").trim();
      if (cmd) {
        const noHeredoc = stripHeredocs(cmd);
        const execLike = stripQuoted(noHeredoc);

        if (b.denyRecursiveGrep !== false) {
          const recursiveGrep = /\bgrep\s+(-\S*r\S*|--recursive)\b/.test(execLike);
          const recursiveFindstr = /\bfindstr\s+\/s\b/i.test(execLike) && !/\/m\b/i.test(execLike);
          const rg = /\brg\b/.test(execLike);
          const bounded =
            /\bgrep\s+-\S*l/.test(execLike) ||
            /(?:^|\s)-[a-zA-Z]*l[a-zA-Z]*(?=\s|$)/.test(execLike) ||
            /--files-with-matches/.test(execLike) ||
            /\s-m\s*\d/.test(execLike) ||
            /--max-count/.test(execLike) ||
            /\|\s*head\b/.test(execLike);
          const rgBounded =
            /\s-l\b/.test(execLike) ||
            /--files-with-matches/.test(execLike) ||
            /\s-m\s*\d/.test(execLike) ||
            /--max-count/.test(execLike) ||
            /\|\s*head\b/.test(execLike);
          if (recursiveGrep && !bounded) {
            deny(
              `zero-token blocked an unbounded recursive grep. Add -m 5 or -l, pipe through head, ` +
                `or use the zero-token "search" tool (returns file:line with 2 context lines, capped at 8 KB).`,
              { event: "grep" },
              isAntigravity
            );
          }
          if (recursiveFindstr) {
            deny(`zero-token blocked "findstr /s" without /m. Add /m, or use the zero-token "search" tool.`, { event: "grep" }, isAntigravity);
          }
          if (rg && !rgBounded) {
            deny(`zero-token blocked rg without a cap. Add -l, -m 5, or pipe through head; or use the zero-token "search" tool.`, { event: "grep" }, isAntigravity);
          }
        }

        if (b.denyPatchLog !== false) {
          if (/\bgit\s+log\b/.test(execLike) && /(\s-p\b|--patch)/.test(execLike) && !/(-n\s*\d|--max-count)/.test(execLike)) {
            deny(`zero-token blocked "git log --patch" without a limit. Add -n 20, or use --stat for a summary.`, { event: "git-log" }, isAntigravity);
          }
          if (/^\s*git\s+diff\s*$/i.test(execLike.trim())) {
            deny(`zero-token blocked a bare "git diff" without target or limit. Use "git diff --stat" for a summary, or specify a target file: "git diff <file>".`, { event: "git-diff" }, isAntigravity);
          }
        }

        // PowerShell & Windows unbounded directory tree walks
        const isRecursiveDir = /\b(Get-ChildItem|gci|dir)\b/i.test(execLike) && /(?:^|\s)(?:-r\b|-recurse\b|\/s\b)/i.test(execLike);
        const isDirBounded = /(?:-depth\s+[1-3]\b|-name\b|-filter\b|-include\b|\|\s*(?:select|sls|head)\b)/i.test(execLike);
        if (isRecursiveDir && !isDirBounded) {
          deny(
            `zero-token blocked an unbounded recursive directory walk ("Get-ChildItem -Recurse" / "dir /s"). Add -Depth 2, or use the zero-token "fsindex" / "search" tool.`,
            { event: "dir-walk" },
            isAntigravity
          );
        }

        if (b.denyVerboseBuild === true) {
          if (/\b(dotnet\s+build|msbuild)\b/.test(execLike) && !/(-v:\s*[qm]\b|--verbosity\s+(quiet|minimal))/.test(execLike)) {
            deny(
              `zero-token: verbose build logs are huge. Use the zero-token "build" tool (returns only errors and grouped warnings), ` +
                `or add -v:q.`,
              { event: "build" },
              isAntigravity
            );
          }
        }

        if (/\b(cat|type|more|Get-Content|gc)\b/i.test(noHeredoc)) {
          const maxBytes = b.catMaxBytes ?? 131072;
          for (const p of pathArgs(noHeredoc)) {
            const full = resolveExisting(p, cwd);
            const size = fileSize(full);
            const budget = effectiveMax(full, size, maxBytes);
            if (size > budget) {
              const isCode = /\.(cs|ts|tsx|js|mjs|cjs|java|kt|py|go|rb|php|cpp|h|hpp|c|xaml)$/i.test(p);
              deny(
                `zero-token blocked dumping ${path.basename(p)} (${Math.round(size / 1024)} KB) to the terminal. ` +
                  (isCode
                    ? `Use the zero-token "outline" tool first, or head -n 100.`
                    : `Read a slice instead: head -n 100, sed -n '1,100p', or the zero-token "search" tool.`),
                { event: "cat", bytes: size, file: path.basename(p) },
                isAntigravity
              );
            }
          }
        }

        // PowerShell: [IO.File]::ReadAllText("...") bypasses Get-Content wording.
        const readAll = noHeredoc.match(/\bReadAllText\(\s*['"]([^'"]+)['"]/i);
        if (readAll) {
          const full = resolveExisting(readAll[1], cwd);
          const size = fileSize(full);
          const budget = effectiveMax(full, size, b.catMaxBytes ?? 131072);
          if (size > budget) {
            deny(
              `zero-token blocked ReadAllText on ${path.basename(readAll[1])} (${Math.round(size / 1024)} KB). ` +
                `Read a slice instead: Get-Content -TotalCount 100, or the zero-token "outline" tool.`,
              { event: "readall", bytes: size, file: path.basename(readAll[1]) },
              isAntigravity
            );
          }
        }
      }
    }
  }

  // On Antigravity, PostToolUse cannot inject context; catch identical call loops in PreToolUse.
  if (isAntigravity) {
    const loopReason = checkLoopAntigravity(cfg, ev, tool, input);
    if (loopReason) {
      deny(loopReason, { event: "loop" }, true);
    }
    respond(true, "allow");
  }
}

main().catch(() => process.exit(0));
