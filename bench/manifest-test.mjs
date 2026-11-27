// Test suite for Z-Plugin Manifest v2 validation
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
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

async function fetchLiveMcpTools(serverPath, tmpDir) {
  const child = spawn(process.execPath, [serverPath], {
    cwd: root,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      Z_PLUGIN_WORKSPACE: root,
      TOKEN_DIET_DATA: path.join(tmpDir, "token-diet"),
      ZERO_TOKEN_DATA: path.join(tmpDir, "token-diet"),
      ZBRAIN_DATA_DIR: path.join(tmpDir, "z-brain"),
      ZBRAIN_DB_PATH: path.join(tmpDir, "z-brain", "brain.sqlite"),
      ZVISION_DATA_DIR: path.join(tmpDir, "z-vision"),
    },
  });

  let buf = "";
  const pending = new Map();
  let nextId = 1;

  child.stdout.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });

  const rpc = (method, params) => {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${method} on ${serverPath}`)), 15000);
      pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  };

  try {
    await rpc("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "manifest-test", version: "1.0.0" },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    const listRes = await rpc("tools/list", {});
    return (listRes.result?.tools || []).map((t) => t.name);
  } finally {
    child.kill();
  }
}

console.log("z-plugin: manifest v2 schema & structure tests");

const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const expectedVersion = rootPkg.version;

const schemaPath = path.join(root, "schemas", "manifest-v2.schema.json");
ok(fs.existsSync(schemaPath), "manifest-v2.schema.json exists");
const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
ok(schema.title === "ZPluginManifestV2", "schema title matches");

const expectedPlugins = ["z-token", "z-brain", "z-mind", "z-gate", "z-craft", "z-vision"];
const tmpMcpDir = fs.mkdtempSync(path.join(os.tmpdir(), "zplugin-manifest-mcp-"));

try {
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

    const serverPath = path.resolve(root, "plugins", pName, manifest.main);
    const liveTools = await fetchLiveMcpTools(serverPath, tmpMcpDir);
    const declaredTools = manifest.mcp.server.tools;
    const missingInManifest = liveTools.filter((t) => !declaredTools.includes(t));
    const extraInManifest = declaredTools.filter((t) => !liveTools.includes(t));
    ok(
      missingInManifest.length === 0 && extraInManifest.length === 0,
      `${pName} manifest MCP tools match live tools/list (${liveTools.length} tools; missing=${JSON.stringify(missingInManifest)}, extra=${JSON.stringify(extraInManifest)})`
    );
  }
} finally {
  fs.rmSync(tmpMcpDir, { recursive: true, force: true });
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
