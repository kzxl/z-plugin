// Test suite for z-brain episodic memory engine
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb, countAtoms, getAtomById } from "../plugins/z-brain/scripts/lib/db.mjs";
import { searchKnowledge } from "../plugins/z-brain/scripts/lib/search.mjs";
import { harvestKnowledge } from "../plugins/z-brain/scripts/lib/harvest.mjs";
import { formatL0Progressive, formatDeepView } from "../plugins/z-brain/scripts/lib/format.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("  ok  ", msg);
}

console.log("z-brain: database & schema");
const db = getDb();
ok(db !== null, "database initialized");
const total = countAtoms(db);
ok(total > 0, `database contains knowledge atoms (total: ${total})`);

console.log("z-brain: search & scoping");
const globalSearch = searchKnowledge({ query: "sqlite", limit: 5 });
ok(Array.isArray(globalSearch) && globalSearch.length > 0, "FTS5 query returns results");
ok(globalSearch[0].id > 0, "result atom has positive ID");

const projectSearch = searchKnowledge({ query: "test", project: "agentic-core", limit: 5 });
for (const item of projectSearch) {
  ok(
    item.project_id === "agentic-core" || item.scope === "global" || item.project_id === "global",
    `scoping honored: item #${item.id} [${item.project_id}, ${item.scope}]`
  );
}

console.log("z-brain: progressive disclosure formatting");
const l0 = formatL0Progressive(globalSearch.slice(0, 2), "Test Query");
ok(l0.includes("Gotcha/Fix:"), "L0 format includes Gotcha/Fix summary");
ok(l0.split("\n").length < 15, "L0 format is compact");

const deepView = formatDeepView(globalSearch[0]);
ok(deepView.includes("QUESTION / PROBLEM:"), "deep view contains question header");
ok(deepView.includes("ANSWER / SOLUTION / FIX:"), "deep view contains answer header");

console.log("z-brain: harvesting");
const single = harvestKnowledge({
  input: "CI Pipeline Failure | Wrong path reference in bench | Updated import path to z-token",
  project: "ci-test",
  tags: ["rd", "ci"],
  trust_level: "verified_fact",
  evidence: "build:ok"
});
ok(single.success === true, "single atom harvest succeeded");
ok(single.id > 0, `harvested ID is #${single.id}`);

const batch = harvestKnowledge({
  input: [
    { question: "Batch Q1", answer: "Batch A1", tags: ["batch"] },
    { question: "Batch Q2", answer: "Batch A2", tags: ["batch"] }
  ],
  project: "ci-test"
});
ok(batch.success === true && batch.count === 2, "batch harvest succeeded");

// Clean test rows
db.exec(`DELETE FROM knowledge_atoms WHERE project_id = 'ci-test'`);

console.log("\nall z-brain tests passed");
