// Comprehensive test suite for z-mind cognitive engineering plugin
import { queryRules, auditPlan } from "../plugins/z-mind/scripts/lib/rules.mjs";
import { detectProject, bootstrapProjectRule } from "../plugins/z-mind/scripts/lib/bootstrap.mjs";
import { synthesizePlan } from "../plugins/z-mind/scripts/lib/plan-generator.mjs";
import { auditArchitecture } from "../plugins/z-mind/scripts/lib/arch-doctor.mjs";
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
ok(allRules.length === 60, `all 60 canonical rules loaded (verified: ${allRules.length})`);

// Category queries
const invariants = queryRules("invariants");
ok(invariants.length === 10, `invariants category has 10 rules (got: ${invariants.length})`);

const langRules = queryRules("lang");
ok(langRules.length === 13, `languages category has 13 rules (got: ${langRules.length})`);

const archRules = queryRules("arch");
ok(archRules.length === 8, `architecture category has 8 rules (got: ${archRules.length})`);

const cogRules = queryRules("cognition");
ok(cogRules.length === 10, `cognition category has 10 rules (got: ${cogRules.length})`);

const domainRules = queryRules("domain");
ok(domainRules.length === 7, `domain category has 7 rules (got: ${domainRules.length})`);

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

console.log("z-mind: plan synthesizer & architecture doctor (v1.1.0)");
// 1. TDD Plan Synthesis test
const synthBugfix = synthesizePlan("Fix deadlock in OrderService during checkout");
ok(synthBugfix.raw.mode === "BUGFIX", "identified bugfix mode");
ok(synthBugfix.raw.phases.length === 5, "synthesized complete 5-phase TDD plan");
ok(synthBugfix.markdown.includes("R_TDD"), "plan cites R_TDD invariant");
ok(synthBugfix.markdown.toLowerCase().includes("reproduction test"), "plan mandates reproduction test");

const synthFeature = synthesizePlan("Implement real-time inventory ledger sync");
ok(synthFeature.raw.mode === "FEATURE", "identified feature mode");
ok(synthFeature.markdown.includes("Seam Analysis & Interface Deletion Test"), "plan mandates interface deletion test");

// 2. Architecture Boundary Doctor test
const archTmp = fs.mkdtempSync(path.join(os.tmpdir(), "zmind-test-arch-"));
try {
  const uiDir = path.join(archTmp, "Views");
  fs.mkdirSync(uiDir, { recursive: true });
  fs.writeFileSync(path.join(uiDir, "OrderForm.cs"), `
using System.Data.SqlClient;
public class OrderForm {
    private DbContext _context;
}
`);
  const archReport = auditArchitecture(archTmp);
  ok(!archReport.passed, "architecture doctor detected UI -> DbContext leakage");
  ok(archReport.violations.some(v => v.category === "ARCH_LAYER_LEAK"), "flagged ARCH_LAYER_LEAK violation");

  // God Class detection check
  fs.writeFileSync(path.join(archTmp, "MegaOrchestrator.cs"), `
public class MegaOrchestrator {
    public void Run() {
        new Service1().Do(); new Service2().Do(); new Service3().Do();
        new Service4().Do(); new Service5().Do(); new Service6().Do();
        new Service7().Do(); new Service8().Do(); new Service9().Do();
    }
}
`);
  const godArchReport = auditArchitecture(archTmp);
  ok(godArchReport.violations.some(v => v.category === "ARCH_GOD_CLASS"), "flagged ARCH_GOD_CLASS high-coupling violation");

  // Composition Root exemption check
  fs.writeFileSync(path.join(archTmp, "ServiceCollectionExtensions.cs"), `
public static class ServiceCollectionExtensions {
    public static void AddAppServices() {
        new Service1().Do(); new Service2().Do(); new Service3().Do();
        new Service4().Do(); new Service5().Do(); new Service6().Do();
        new Service7().Do(); new Service8().Do(); new Service9().Do();
    }
}
`);
  const compArchReport = auditArchitecture(archTmp);
  ok(!compArchReport.violations.some(v => v.file.includes("ServiceCollectionExtensions") && v.category === "ARCH_GOD_CLASS"), "composition root exempt from ARCH_GOD_CLASS violation");
} finally {
  fs.rmSync(archTmp, { recursive: true, force: true });
}

console.log("\nall z-mind tests passed (56 rules & bootstrap verified)");
