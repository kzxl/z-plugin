#!/usr/bin/env node
// PostToolUse loop breaker: warns once when the exact same tool call repeats.
// Contract: stdin = hook payload JSON, stdout = hook output JSON (or nothing).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./lib/config.mjs";

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
  const lb = cfg.loopBreaker || {};
  if (lb.enabled === false) {
    if (isAntigravity) process.stdout.write("{}");
    return;
  }

  const threshold = lb.threshold ?? 3;

  const rawSession = ev.session_id || ev.sessionId || ev.conversation_id || ev.conversationId || (cwd ? path.basename(cwd) : "default");
  const session = String(rawSession).replace(/[^\w.-]/g, "_");
  const tool = ev.toolCall?.name || ev.tool_name || "";
  const input = ev.toolCall?.args || ev.tool_input || {};
  if (!tool) {
    if (isAntigravity) process.stdout.write("{}");
    return;
  }

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

  // Keep the state file small on long sessions.
  const keys = Object.keys(state);
  if (keys.length > 200) {
    for (const k of keys.slice(0, keys.length - 200)) delete state[k];
  }

  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state));
  } catch {}

  if (isAntigravity) {
    process.stdout.write("{}");
    return;
  }

  if (entry.count === threshold && !entry.warned) {
    entry.warned = true;
    try {
      fs.writeFileSync(file, JSON.stringify(state));
    } catch {}
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext:
            `zero-token: this exact ${tool} call has now run ${threshold} times with identical input. ` +
            `Repeating it will not produce a different result. Change the input, narrow the target, or report what is missing instead of retrying.`,
        },
      })
    );
  }
}

main().catch(() => process.exit(0));
