// Regression & invariant suite for Antigravity subagent schemas and SSOT rules/AGENTS.md
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

console.log("z-plugin: subagent frontmatter & rules SSOT standardization tests");

// 1. Subagent frontmatter must conform to Antigravity native schema
const agentSpecs = [
  { plugin: "z-token", file: "scout.md", expectedName: "scout" },
  { plugin: "z-mind", file: "architect.md", expectedName: "architect" },
  { plugin: "z-mind", file: "investigator.md", expectedName: "investigator" },
  { plugin: "z-mind", file: "reviewer.md", expectedName: "reviewer" }
];

for (const spec of agentSpecs) {
  const fullPath = path.join(root, "plugins", spec.plugin, "agents", spec.file);
  assert.ok(fs.existsSync(fullPath), `${spec.plugin}/agents/${spec.file} exists`);
  const content = fs.readFileSync(fullPath, "utf8");
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(Boolean(fmMatch), `${spec.file} has valid YAML frontmatter block`);
  const fm = fmMatch[1];

  assert.ok(new RegExp(`^name:\\s*${spec.expectedName}\\s*$`, "m").test(fm), `${spec.file} declares name: ${spec.expectedName}`);
  assert.ok(/^description:\s*\S+/m.test(fm), `${spec.file} declares non-empty description`);
  assert.ok(/^subagent:\s*true\s*$/m.test(fm), `${spec.file} declares subagent: true`);
  assert.ok(/^mainAgent:\s*false\s*$/m.test(fm), `${spec.file} declares mainAgent: false`);
  assert.ok(/^tools:\s*\[read_file,\s*run_command,\s*manage_task\]\s*$/m.test(fm), `${spec.file} uses Antigravity native tools`);
  assert.ok(!/^color:/m.test(fm), `${spec.file} omits unsupported color field`);
  assert.ok(!/\bRead\b.*?\bBash\b/.test(fm), `${spec.file} omits legacy [Read, Bash] frontmatter`);
}

// Verify Tier routing metadata is preserved in z-mind specialist descriptions
const archRaw = fs.readFileSync(path.join(root, "plugins", "z-mind", "agents", "architect.md"), "utf8");
const invRaw = fs.readFileSync(path.join(root, "plugins", "z-mind", "agents", "investigator.md"), "utf8");
const revRaw = fs.readFileSync(path.join(root, "plugins", "z-mind", "agents", "reviewer.md"), "utf8");
assert.ok(archRaw.includes("Tier 2 Specialist"), "architect.md preserves Tier 2 Specialist routing hint");
assert.ok(invRaw.includes("Tier 2 Specialist"), "investigator.md preserves Tier 2 Specialist routing hint");
assert.ok(revRaw.includes("Adaptive Tier 2/3"), "reviewer.md preserves Adaptive Tier 2/3 routing hint");

// Verify scout body references read_file (StartLine/EndLine) rather than legacy Read offset/limit
const scoutRaw = fs.readFileSync(path.join(root, "plugins", "z-token", "agents", "scout.md"), "utf8");
assert.ok(scoutRaw.includes("read_file") && !scoutRaw.includes("using `Read` with `offset`"), "scout.md body uses Antigravity read_file instructions");

// 2. Always-on rules/AGENTS.md SSOT & token budget checks
const markerPlugins = ["z-mind", "z-gate", "z-token", "z-craft"];
for (const pName of markerPlugins) {
  const rulePath = path.join(root, "plugins", pName, "rules", "AGENTS.md");
  const txt = fs.readFileSync(rulePath, "utf8");
  assert.ok(txt.includes(`<!-- ${pName}:begin -->`) && txt.includes(`<!-- ${pName}:end -->`), `${pName}/rules/AGENTS.md preserves begin/end sync markers`);
}

const allPluginNames = ["z-brain", "z-craft", "z-gate", "z-mind", "z-token"];
const rulesByPlugin = Object.fromEntries(
  allPluginNames.map((p) => [p, fs.readFileSync(path.join(root, "plugins", p, "rules", "AGENTS.md"), "utf8")])
);

const rCacheOwners = allPluginNames.filter((p) => /\bR_CACHE\b/.test(rulesByPlugin[p]));
assert.ok(rCacheOwners.length === 1 && rCacheOwners[0] === "z-token", `R_CACHE has single SSOT owner z-token (found: ${rCacheOwners.join(", ")})`);

const rReuseHeadingOwners = allPluginNames.filter((p) => /^##\s+.*?\bR_REUSE\b/m.test(rulesByPlugin[p]));
assert.ok(rReuseHeadingOwners.length === 1 && rReuseHeadingOwners[0] === "z-gate", `R_REUSE heading has single SSOT owner z-gate`);

const rGitHeadingOwners = allPluginNames.filter((p) => /^##\s+.*?\bR_GIT\b/m.test(rulesByPlugin[p]));
assert.ok(rGitHeadingOwners.length === 1 && rGitHeadingOwners[0] === "z-gate", `R_GIT heading has single SSOT owner z-gate`);

assert.ok(rulesByPlugin["z-mind"].includes("flash_lite") && rulesByPlugin["z-mind"].includes("R_TEAM"), "z-mind/rules/AGENTS.md includes 4-tier R_TEAM routing");

const totalRuleBytes = Object.values(rulesByPlugin).reduce((sum, t) => sum + Buffer.byteLength(t, "utf8"), 0);
assert.ok(totalRuleBytes <= 10500, `Total plugins/*/rules/AGENTS.md size (${totalRuleBytes} B) stays within <= 10,500 B budget`);

const installPs1 = fs.readFileSync(path.join(root, "install.ps1"), "utf8");
assert.ok(installPs1.includes("ZCode") && installPs1.includes("[Read, Bash]"), "install.ps1 adapts Antigravity subagent frontmatter for ZCode compatibility");

console.log("  ok   subagent frontmatter, ZCode installer bridge, and SSOT AGENTS.md budgets verified");
console.log("\nall standardization tests passed!");
