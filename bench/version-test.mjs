#!/usr/bin/env node
/**
 * Monorepo Version Consistency Test
 * Invariant: Every plugin manifest and marketplace entry MUST strictly match the repo release version.
 */

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

console.log("monorepo: version consistency checks");

const rootPkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const releaseVersion = rootPkg.version;
ok(Boolean(releaseVersion), `root package.json has release version: ${releaseVersion}`);

// 1. Check marketplace.json
const mktPath = path.join(root, "marketplace.json");
const mkt = JSON.parse(fs.readFileSync(mktPath, "utf8"));
for (const p of mkt.plugins) {
  ok(p.version === releaseVersion, `marketplace.json plugin '${p.name}' version (${p.version}) matches release (${releaseVersion})`);
}

// 2. Check each plugin manifest
const pluginsDir = path.join(root, "plugins");
const pluginFolders = fs.readdirSync(pluginsDir).filter(f => fs.statSync(path.join(pluginsDir, f)).isDirectory());

for (const dirName of pluginFolders) {
  const pDir = path.join(pluginsDir, dirName);
  
  // Antigravity plugin.json
  const agyManifestPath = path.join(pDir, "plugin.json");
  if (fs.existsSync(agyManifestPath)) {
    const agy = JSON.parse(fs.readFileSync(agyManifestPath, "utf8"));
    ok(agy.version === releaseVersion, `${dirName}/plugin.json version (${agy.version}) matches release (${releaseVersion})`);
  }

  // ZCode .zcode-plugin/plugin.json
  const zcodeManifestPath = path.join(pDir, ".zcode-plugin", "plugin.json");
  if (fs.existsSync(zcodeManifestPath)) {
    const zcode = JSON.parse(fs.readFileSync(zcodeManifestPath, "utf8"));
    ok(zcode.version === releaseVersion, `${dirName}/.zcode-plugin/plugin.json version (${zcode.version}) matches release (${releaseVersion})`);
  }

  // AEOS z-plugin.manifest.json
  const aeosManifestPath = path.join(pDir, "z-plugin.manifest.json");
  if (fs.existsSync(aeosManifestPath)) {
    const aeos = JSON.parse(fs.readFileSync(aeosManifestPath, "utf8"));
    ok(aeos.version === releaseVersion, `${dirName}/z-plugin.manifest.json version (${aeos.version}) matches release (${releaseVersion})`);
  }
}

// 3. Check Extension DLC manifests
const extDir = path.join(root, "extensions");
if (fs.existsSync(extDir)) {
  const extFolders = fs.readdirSync(extDir).filter(f => fs.statSync(path.join(extDir, f)).isDirectory());
  for (const dlcName of extFolders) {
    const dlcFolder = path.join(extDir, dlcName);
    const dlcManifestPath = path.join(dlcFolder, "z-plugin.manifest.json");
    if (fs.existsSync(dlcManifestPath)) {
      const dlcManifest = JSON.parse(fs.readFileSync(dlcManifestPath, "utf8"));
      ok(dlcManifest.version === releaseVersion, `extensions/${dlcName}/z-plugin.manifest.json version (${dlcManifest.version}) matches release (${releaseVersion})`);
    }

    const dlcPkgPath = path.join(dlcFolder, "package.json");
    if (fs.existsSync(dlcPkgPath)) {
      const dlcPkg = JSON.parse(fs.readFileSync(dlcPkgPath, "utf8"));
      ok(dlcPkg.version === releaseVersion, `extensions/${dlcName}/package.json version (${dlcPkg.version}) matches release (${releaseVersion})`);
    }
  }
}

console.log("\nall version consistency checks passed");
