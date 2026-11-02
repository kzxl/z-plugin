// Comprehensive test suite for z-mind cognitive engineering plugin
import { queryRules, auditPlan } from "../plugins/z-mind/scripts/lib/rules.mjs";
import { detectProject, bootstrapProjectRule } from "../plugins/z-mind/scripts/lib/bootstrap.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("  ok  ", msg);
}

console.log("z-mind: rules catalog coverage");
const allRules = queryRules("all");
ok(allRules.length === 56, `all 56 canonical rules loaded (verified: ${allRules.length})`);

// Category queries
const invariants = queryRules("invariants");
ok(invariants.length === 8, `invariants category has 8 rules (got: ${invariants.length})`);

const langRules = queryRules("lang");
ok(langRules.length === 13, `languages category has 13 rules (got: ${langRules.length})`);

const archRules = queryRules("arch");
ok(archRules.length === 8, `architecture category has 8 rules (got: ${archRules.length})`);

const cogRules = queryRules("cognition");
ok(cogRules.length === 10, `cognition category has 10 rules (got: ${cogRules.length})`);

const domainRules = queryRules("domain");
ok(domainRules.length === 5, `domain category has 5 rules (got: ${domainRules.length})`);

const opsRules = queryRules("ops");
ok(opsRules.length === 12, `ops category has 12 rules (got: ${opsRules.length})`);

console.log("z-mind: keyword & tag queries");
const csRules = queryRules("csharp");
ok(csRules.some(r => r.code === "R_CS"), "csharp tag matches R_CS");

const wpfRules = queryRules("wpf");
ok(wpfRules.some(r => r.code === "R_WPF"), "wpf tag matches R_WPF");

const invRules = queryRules("inventory");
ok(invRules.some(r => r.code === "R_DOMAIN_INV"), "inventory tag matches R_DOMAIN_INV");

const reactRules = queryRules("react");
ok(reactRules.some(r => r.code === "R_REACT"), "react tag matches R_REACT");

const antiSlopRules = queryRules("anti-slop");
ok(antiSlopRules.some(r => r.code === "R_ANTI_SLOP"), "anti-slop tag matches R_ANTI_SLOP");

console.log("z-mind: invariant audit checks");
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

const bindingSourcePlan = auditPlan(`
feat(ui): bind customer grid with BindingSource
- Write test in CustomerViewTests.cs
`);
ok(bindingSourcePlan.warnings.some(w => w.includes("R_WPF")), "BindingSource caught by R_WPF");

const sqlConcatPlan = auditPlan(`
feat(rep): dynamic query via SELECT * FROM Orders + id
- Verify test passes
`);
ok(sqlConcatPlan.warnings.some(w => w.includes("R_DB")), "SQL concatenation caught by R_DB");

const hardcodedPathPlan = auditPlan(`
feat(cfg): set asset folder to C:\\Users\\Administrator\\data
- Test path resolution
`);
ok(hardcodedPathPlan.warnings.some(w => w.includes("R_PKG")), "Hardcoded absolute path caught by R_PKG");

const fullPublishPlan = auditPlan(`
chore(release): dotnet publish with --self-contained true
- Test release package
`);
ok(fullPublishPlan.warnings.some(w => w.includes("R_PUB")), "Self-contained publish caught by R_PUB");

const aggressiveRewritePlan = auditPlan(`
refactor(legacy): complete rewrite of entire billing subsystem
- Test new implementation
`);
ok(aggressiveRewritePlan.warnings.some(w => w.includes("R_EPISTEMIC")), "Aggressive rewrite caught by R_EPISTEMIC");

console.log("z-mind: bootstrap & project-rule generator");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zmind-test-bootstrap-"));
try {
  fs.writeFileSync(path.join(tmpDir, "MyApp.csproj"), "<Project></Project>");
  fs.writeFileSync(path.join(tmpDir, ".gitignore"), "bin/\nobj/\n");

  const bootRes = bootstrapProjectRule(tmpDir);
  ok(bootRes.success === true, "bootstrap successfully created .project-rule.md");
  ok(bootRes.language === "csharp", "detected csharp stack");
  ok(bootRes.rules.includes("R_CS"), "configured R_CS rule");

  const createdContent = fs.readFileSync(bootRes.path, "utf8");
  ok(createdContent.includes('plugin: "z-mind"'), "rule specifies plugin: z-mind");
  ok(createdContent.includes("zbrain_fetch"), "rule contains zbrain_fetch");

  const gitignoreContent = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf8");
  ok(gitignoreContent.includes(".project-rule.md"), "added .project-rule.md to .gitignore");

  const duplicateRes = bootstrapProjectRule(tmpDir);
  ok(duplicateRes.alreadyExists === true, "prevented duplicate overwrite without force");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log("\nall z-mind tests passed (56 rules & bootstrap verified)");
