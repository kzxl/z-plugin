// Test suite for z-mind cognitive engineering plugin
import { queryRules, auditPlan } from "../plugins/z-mind/scripts/lib/rules.mjs";

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("  ok  ", msg);
}

console.log("z-mind: rules lookup");
const allRules = queryRules("all");
ok(allRules.length >= 8, `all rules returned (${allRules.length} rules)`);

const tddRule = queryRules("tdd");
ok(tddRule.length > 0 && tddRule[0].code === "R_TDD", "tdd rule lookup works");

const perfRule = queryRules("perf");
ok(perfRule.length > 0 && perfRule[0].code === "R_PERF", "perf rule lookup works");

console.log("z-mind: invariant audit");
const passingPlan = auditPlan(`
feat(auth): add OAuth2 refresh token rotation
- Write automated reproduction test for expired token in auth_test.go
- Implement token rotation with atomic revocation
- Verify all unit tests pass (14/14 tests PASS)
`);
ok(passingPlan.passed === true, "clean TDD plan passes audit");

const failingBugfix = auditPlan(`
fix(db): fix random crash in background worker
- Added try catch around worker
`);
ok(failingBugfix.passed === false, "bugfix without reproduction test fails audit");
ok(failingBugfix.warnings.some(w => w.includes("R_TDD")), "warning cites R_TDD");

const selfPraise = auditPlan(`
feat(cache): implement optimal and perfect caching
`);
ok(selfPraise.warnings.some(w => w.includes("R_PROOF")), "subjective self-praise caught by R_PROOF");

console.log("\nall z-mind tests passed");
