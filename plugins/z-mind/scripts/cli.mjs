#!/usr/bin/env node
/**
 * Z-Mind CLI Facade
 */

import { queryRules, auditPlan } from "./lib/rules.mjs";
import { bootstrapProjectRule } from "./lib/bootstrap.mjs";

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case "init":
  case "bootstrap": {
    const targetDir = args[0] || process.cwd();
    const force = args.includes("--force");
    const res = bootstrapProjectRule(targetDir, { force });
    if (res.success) {
      console.log(`\n✅ [Z-MIND INIT] ${res.message}`);
      console.log(`  • Project Name: ${res.projectName}`);
      console.log(`  • Stack Language: ${res.language}`);
      console.log(`  • Active Rules: ${res.rules.join(", ")}\n`);
    } else {
      console.log(`\nℹ️ [Z-MIND INIT] ${res.message}\n`);
    }
    break;
  }
  case "rules": {
    const topic = args[0] || "all";
    const rules = queryRules(topic);
    console.log(`\n🧠 Z-Mind Engineering Invariants (${topic}):\n`);
    rules.forEach(r => {
      console.log(`• [${r.code}] ${r.title}:`);
      console.log(`  ${r.summary}\n`);
    });
    break;
  }

  case "audit":
  case "check": {
    const text = args.join(" ");
    if (!text) {
      console.error("Usage: node cli.mjs audit <text-to-audit>");
      process.exit(1);
    }
    const res = auditPlan(text);
    console.log(`\n=== Z-MIND AUDIT REPORT ===`);
    console.log(`Status: ${res.passed ? "PASSED" : "WARNINGS DETECTED"}`);
    console.log(`Summary: ${res.summary}\n`);
    if (res.warnings.length > 0) {
      console.log("⚠️ Warnings:");
      res.warnings.forEach(w => console.log(` - ${w}`));
    } else {
      console.log("✅ All invariant checks satisfied.");
    }
    break;
  }

  case "status":
  default: {
    const rules = queryRules("all");
    console.log(`\n🧠 Z-Mind Cognitive OS:`);
    console.log(`  • Version: 1.0.0`);
    console.log(`  • Total Invariants: ${rules.length}`);
    console.log(`  • Protocols: Bugfix (4-phase), Refactor (NEV gate), Architecture, Teamwork`);
    console.log(`  • Sub-agents: architect, investigator, reviewer`);
    console.log(`  • Commands: init, rules, audit, status\n`);
    break;
  }
}
