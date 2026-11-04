#!/usr/bin/env node
/**
 * Single Source of Truth (SSoT) Manifest Compiler
 * Reads each plugin's `z-plugin.manifest.json` (Manifest v2) and compiles/syncs
 * the platform-specific manifests:
 *  - `plugin.json` (Antigravity 2.0 format)
 *  - `.zcode-plugin/plugin.json` (ZCode format)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const pluginsDir = path.join(root, "plugins");

console.log("[MANIFEST-COMPILER] Compiling platform manifests from Manifest v2 SSoT...");

const pluginFolders = fs.readdirSync(pluginsDir).filter(f => fs.statSync(path.join(pluginsDir, f)).isDirectory());
let compiledCount = 0;

for (const dirName of pluginFolders) {
  const pDir = path.join(pluginsDir, dirName);
  const ssotPath = path.join(pDir, "z-plugin.manifest.json");

  if (!fs.existsSync(ssotPath)) {
    console.warn(`  [WARN] Skipping ${dirName}: No z-plugin.manifest.json found.`);
    continue;
  }

  const ssot = JSON.parse(fs.readFileSync(ssotPath, "utf8"));
  const { id, name, version, description, author } = ssot;

  // 1. Compile/Sync Antigravity plugin.json
  const agyPath = path.join(pDir, "plugin.json");
  let agy = {};
  if (fs.existsSync(agyPath)) {
    try { agy = JSON.parse(fs.readFileSync(agyPath, "utf8")); } catch {}
  }
  agy.name = id;
  agy.displayName = agy.displayName || name;
  agy.description = description;
  agy.version = version;
  if (typeof author === "string") {
    agy.author = author;
  } else if (author?.name) {
    agy.author = author.name;
  }
  fs.writeFileSync(agyPath, JSON.stringify(agy, null, 2) + "\n", "utf8");

  // 2. Compile/Sync ZCode .zcode-plugin/plugin.json
  const zcodeDir = path.join(pDir, ".zcode-plugin");
  if (!fs.existsSync(zcodeDir)) fs.mkdirSync(zcodeDir, { recursive: true });
  const zcodePath = path.join(zcodeDir, "plugin.json");
  let zcode = {};
  if (fs.existsSync(zcodePath)) {
    try { zcode = JSON.parse(fs.readFileSync(zcodePath, "utf8")); } catch {}
  }
  zcode.name = id;
  zcode.version = version;
  zcode.description = description;
  zcode.author = typeof author === "string" ? { name: author } : (author || { name: "kzxl" });
  fs.writeFileSync(zcodePath, JSON.stringify(zcode, null, 2) + "\n", "utf8");

  console.log(`  ✓ Compiled manifests for '${id}' (v${version})`);
  compiledCount++;
}

console.log(`\n[SUCCESS] Successfully compiled platform manifests for ${compiledCount} core plugins from Manifest v2 SSoT!`);
