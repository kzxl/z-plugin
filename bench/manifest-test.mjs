// Test suite for Z-Plugin Manifest v2 validation
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("  ok  ", msg);
}

console.log("z-plugin: manifest v2 schema & structure tests");

const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const expectedVersion = rootPkg.version;

const schemaPath = path.join(root, "schemas", "manifest-v2.schema.json");
ok(fs.existsSync(schemaPath), "manifest-v2.schema.json exists");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
ok(schema.title === "ZPluginManifestV2", "schema title matches");

const expectedPlugins = ["z-token", "z-brain", "z-mind", "z-gate", "z-craft"];

for (const pName of expectedPlugins) {
  const manifestPath = path.join(root, "plugins", pName, "z-plugin.manifest.json");
  ok(fs.existsSync(manifestPath), `${pName}/z-plugin.manifest.json exists on disk`);

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  ok(manifest.id === pName, `${pName} manifest id matches folder name`);
  ok(manifest.version === expectedVersion, `${pName} version matches suite release version (${expectedVersion})`);
  ok(manifest.kind === "domain-module", `${pName} kind is domain-module`);
  ok(typeof manifest.main === "string", `${pName} has main entrypoint`);
  ok(manifest.capabilities && Array.isArray(manifest.capabilities.provides), `${pName} declares provided capabilities`);
  ok(manifest.capabilities.provides.length > 0, `${pName} provides at least 1 capability`);
  ok(manifest.mcp && manifest.mcp.server && Array.isArray(manifest.mcp.server.tools), `${pName} declares MCP tools`);
}

// Validate extension DLCs
const dlcManifestPath = path.join(root, "extensions", "dlc-erp", "z-plugin.manifest.json");
ok(fs.existsSync(dlcManifestPath), "extensions/dlc-erp/z-plugin.manifest.json exists on disk");
const dlcManifest = JSON.parse(fs.readFileSync(dlcManifestPath, "utf8"));
ok(dlcManifest.id === "dlc-erp", "dlc-erp manifest id matches");
ok(dlcManifest.version === expectedVersion, `dlc-erp version matches suite release version (${expectedVersion})`);
ok(dlcManifest.kind === "extension-dlc", "dlc-erp kind is extension-dlc");
ok(dlcManifest.extends && dlcManifest.extends.plugin === "z-mind", "dlc-erp extends z-mind");
ok(dlcManifest.contributions && Array.isArray(dlcManifest.contributions.rules), "dlc-erp has contributed rules");

console.log("\nall manifest v2 validation checks passed!");
