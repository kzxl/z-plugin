#!/usr/bin/env node
// Antigravity native hook contract, MCP dedup, and workspace guard regression suite.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const guardScript = path.join(root, "plugins", "z-token", "scripts", "guard.mjs");
const gitGuardScript = path.join(root, "plugins", "z-gate", "scripts", "git-guard.mjs");
const sessionStartScript = path.join(root, "plugins", "z-brain", "scripts", "session-start.mjs");
const observeScript = path.join(root, "plugins", "z-brain", "scripts", "observe.mjs");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agy-hooks-test-"));
const dataDir = path.join(tmp, "data");
const bigFile = path.join(tmp, "Big.cs");
const smallFile = path.join(tmp, "Small.cs");
fs.writeFileSync(bigFile, "// pad\n".repeat(25000));
fs.writeFileSync(smallFile, "class A { void B() {} }\n");

function runHook(script, args, payload, env = {}) {
  const res = spawnSync(process.execPath, [script, ...args], {
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: 15000,
    env: { ...process.env, TOKEN_DIET_DATA: dataDir, ...env },
  });
  return { out: (res.stdout || "").trim(), err: (res.stderr || "").trim(), status: res.status };
}

function parseJson(raw, label) {
  assert.ok(raw.length > 0, `${label}: expected JSON stdout, got empty string`);
  try {
    return JSON.parse(raw);
  } catch (e) {
    assert.fail(`${label}: invalid JSON stdout: ${raw}`);
  }
}

console.log("1. Antigravity PreToolUse: z-token guard.mjs");
{
  const bigRead = {
    hookEventName: "PreToolUse",
    conversationId: "conv-guard-1",
    workspacePaths: [tmp],
    cwd: tmp,
    toolCall: { id: "toolu_01", name: "read_file", args: { Path: bigFile } },
  };
  const r1 = parseJson(runHook(guardScript, [], bigRead).out, "big read_file");
  assert.equal(r1.decision, "deny", "big read_file must return decision: deny");
  assert.ok(typeof r1.reason === "string" && r1.reason.length > 0, "deny must include reason");
  assert.equal(r1.hookSpecificOutput, undefined, "Antigravity output must not use Claude hookSpecificOutput");

  const smallRead = {
    hookEventName: "PreToolUse",
    conversationId: "conv-guard-2",
    workspacePaths: [tmp],
    cwd: tmp,
    toolCall: { id: "toolu_02", name: "read_file", args: { Path: smallFile } },
  };
  const r2 = parseJson(runHook(guardScript, [], smallRead).out, "small read_file");
  assert.equal(r2.decision, "allow", "small read_file must return decision: allow");

  const badGrep = {
    hookEventName: "PreToolUse",
    conversationId: "conv-guard-3",
    workspacePaths: [tmp],
    cwd: tmp,
    toolCall: { id: "toolu_03", name: "run_command", args: { CommandLine: "grep -rn OrderStatus ." } },
  };
  const r3 = parseJson(runHook(guardScript, [], badGrep).out, "unbounded grep");
  assert.equal(r3.decision, "deny", "unbounded grep -rn must return decision: deny");

  const okGrep = {
    hookEventName: "PreToolUse",
    conversationId: `conv-loop-${Date.now()}`,
    workspacePaths: [tmp],
    cwd: tmp,
    toolCall: { id: "toolu_04", name: "run_command", args: { CommandLine: "grep -rn -m 5 OrderStatus ." } },
  };
  assert.equal(parseJson(runHook(guardScript, [], okGrep).out, "loop 1").decision, "allow");
  assert.equal(parseJson(runHook(guardScript, [], okGrep).out, "loop 2").decision, "allow");
  const loop3 = parseJson(runHook(guardScript, [], okGrep).out, "loop 3");
  assert.equal(loop3.decision, "deny", "3rd identical Antigravity call must be denied by integrated loop breaker");
  assert.ok(loop3.reason.toLowerCase().includes("3 times"), `expected loop reason, got: ${loop3.reason}`);
}

console.log("2. Antigravity PreToolUse: z-gate git-guard.mjs");
{
  const lazyStage = {
    hookEventName: "PreToolUse",
    conversationId: "conv-gate-1",
    workspacePaths: [tmp],
    cwd: tmp,
    toolCall: { id: "toolu_10", name: "run_command", args: { CommandLine: "git add -A" } },
  };
  const g1 = parseJson(runHook(gitGuardScript, [], lazyStage).out, "git add -A");
  assert.equal(g1.decision, "deny", "git add -A must return decision: deny on Antigravity");
  assert.ok(g1.reason.includes("R_GIT"), "deny reason must cite R_GIT");

  const safeCmd = {
    hookEventName: "PreToolUse",
    conversationId: "conv-gate-2",
    workspacePaths: [tmp],
    cwd: tmp,
    toolCall: { id: "toolu_11", name: "run_command", args: { CommandLine: "git status" } },
  };
  const g2 = parseJson(runHook(gitGuardScript, [], safeCmd).out, "git status");
  assert.equal(g2.decision, "allow", "git status must return decision: allow");
}

console.log("3. Antigravity SessionStart & PostToolUse: z-brain");
{
  const sessionPayload = {
    hookEventName: "SessionStart",
    conversationId: "conv-session-1",
    workspacePaths: [root],
  };
  const sOut = parseJson(runHook(sessionStartScript, [], sessionPayload).out, "session-start");
  assert.equal(sOut.hookSpecificOutput, undefined, "SessionStart must not return Claude hookSpecificOutput on Antigravity");
  if (sOut.injectSteps) {
    assert.ok(Array.isArray(sOut.injectSteps), "injectSteps must be array");
    assert.equal(typeof sOut.injectSteps[0]?.systemMessage?.systemMessage, "string", "injectSteps[0].systemMessage.systemMessage must be string");
  }

  const editPayload = {
    hookEventName: "PostToolUse",
    conversationId: "conv-obs-1",
    workspacePaths: [tmp],
    cwd: tmp,
    toolCall: {
      id: "toolu_20",
      name: "edit_file",
      args: { Path: smallFile, Target: "void B()", Replacement: "void C()" },
    },
  };
  const oRes = runHook(observeScript, ["record"], editPayload);
  assert.equal(oRes.status, 0);
  const oJson = parseJson(oRes.out, "observe record");
  assert.deepEqual(oJson, {}, "Antigravity PostToolUse must output {}");
}

console.log("4. Workspace guard & edit-observer Antigravity keys");
{
  const { resolveWorkspace, isNonProjectSystemDir } = await import("../plugins/z-brain/scripts/lib/workspace.mjs");
  const { normalizeHookEvent } = await import("../plugins/z-brain/scripts/lib/edit-observer.mjs");

  const prevEnv = process.env.ZBRAIN_WORKSPACE;
  process.env.ZBRAIN_WORKSPACE = ".";
  try {
    const resolved = resolveWorkspace(tmp);
    assert.equal(path.resolve(resolved), path.resolve(tmp), 'ZBRAIN_WORKSPACE="." must not override explicit cwd');
  } finally {
    if (prevEnv === undefined) delete process.env.ZBRAIN_WORKSPACE;
    else process.env.ZBRAIN_WORKSPACE = prevEnv;
  }

  assert.equal(isNonProjectSystemDir("C:\\Users\\phong.vo\\AppData\\Local\\Programs\\antigravity"), true, "IDE install dir must be rejected");
  assert.equal(isNonProjectSystemDir(root), false, "real git repo must be allowed");

  const norm = normalizeHookEvent({
    hookEventName: "PostToolUse",
    workspacePaths: [tmp],
    toolCall: { name: "edit_file", args: { Path: smallFile, Target: "oldVal", Replacement: "newVal" } },
  });
  assert.equal(norm.host, "antigravity");
  assert.equal(norm.oldString, "oldVal", "Target must map to oldString");
  assert.equal(norm.content, "newVal", "Replacement must map to content");
}

console.log("5. MCP config & hooks hygiene");
{
  for (const pName of ["z-brain", "z-mind", "z-token"]) {
    const mcp = JSON.parse(fs.readFileSync(path.join(root, "plugins", pName, "mcp_config.json"), "utf8"));
    const env = mcp.mcpServers?.[pName]?.env || {};
    for (const [k, v] of Object.entries(env)) {
      assert.notEqual(v, ".", `${pName}/mcp_config.json must not hardcode ${k}="."`);
    }
  }
  const installPs1 = fs.readFileSync(path.join(root, "install.ps1"), "utf8");
  assert.ok(
    !installPs1.includes("$mcp.mcpServers | Add-Member -MemberType NoteProperty -Name $p"),
    "install.ps1 must not duplicate plugin MCP servers into global mcp_config.json"
  );
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log("\nall Antigravity hook & plugin contract tests passed!");
