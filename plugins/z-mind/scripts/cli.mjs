#!/usr/bin/env node
/**
 * Z-Mind CLI Facade
 */

import { queryRules, auditPlan } from "./lib/rules.mjs";

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
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
    console.log(`  • Commands: rules, audit, status\n`);
    break;
  }
}
