#!/usr/bin/env node
/**
 * Monorepo Version Synchronizer
 * Synchronizes or bumps versions across:
 * - package.json
 * - marketplace.json
 * - plugins/*\/plugin.json (Antigravity)
 * - plugins/*\/.zcode-plugin/plugin.json (ZCode)
 * - README.md Shipped Plugins table
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

const targetVersion = process.argv[2] || JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;

if (!targetVersion || !/^\d+\.\d+\.\d+(-[a-zA-Z0-9\.\-_]+)?$/.test(targetVersion)) {
  console.error(`Invalid version format: '${targetVersion}'. Must follow SemVer (e.g. 1.0.0 or 1.1.0).`);
  process.exit(1);
}

console.log(`[SYNC-VERSION] Synchronizing monorepo to target version: ${targetVersion}`);

// 1. package.json
const pkgPath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
if (pkg.version !== targetVersion) {
  pkg.version = targetVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");
  console.log(`  ✓ Updated package.json -> ${targetVersion}`);
} else {
  console.log(`  - package.json already at ${targetVersion}`);
}

// 2. marketplace.json
const mktPath = path.join(root, "marketplace.json");
const mkt = JSON.parse(fs.readFileSync(mktPath, "utf8"));
let mktChanged = false;
for (const p of mkt.plugins) {
  if (p.version !== targetVersion) {
    p.version = targetVersion;
    mktChanged = true;
  }
}
if (mktChanged) {
  fs.writeFileSync(mktPath, JSON.stringify(mkt, null, 2) + "\n", "utf8");
  console.log(`  ✓ Updated marketplace.json plugins -> ${targetVersion}`);
} else {
  console.log(`  - marketplace.json plugins already at ${targetVersion}`);
}

// 3. plugins/* manifests
const pluginsDir = path.join(root, "plugins");
const folders = fs.readdirSync(pluginsDir).filter(f => fs.statSync(path.join(pluginsDir, f)).isDirectory());

for (const dirName of folders) {
  const pDir = path.join(pluginsDir, dirName);
  
  // Antigravity
  const agyPath = path.join(pDir, "plugin.json");
  if (fs.existsSync(agyPath)) {
    const agy = JSON.parse(fs.readFileSync(agyPath, "utf8"));
    if (agy.version !== targetVersion) {
      agy.version = targetVersion;
      fs.writeFileSync(agyPath, JSON.stringify(agy, null, 2) + "\n", "utf8");
      console.log(`  ✓ Updated plugins/${dirName}/plugin.json -> ${targetVersion}`);
    }
  }

  // ZCode
  const zcodePath = path.join(pDir, ".zcode-plugin", "plugin.json");
  if (fs.existsSync(zcodePath)) {
    const zcode = JSON.parse(fs.readFileSync(zcodePath, "utf8"));
    if (zcode.version !== targetVersion) {
      zcode.version = targetVersion;
      fs.writeFileSync(zcodePath, JSON.stringify(zcode, null, 2) + "\n", "utf8");
      console.log(`  ✓ Updated plugins/${dirName}/.zcode-plugin/plugin.json -> ${targetVersion}`);
    }
  }

  // AEOS Manifest v2
  const manifestPath = path.join(pDir, "z-plugin.manifest.json");
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    if (manifest.version !== targetVersion) {
      manifest.version = targetVersion;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
      console.log(`  ✓ Updated plugins/${dirName}/z-plugin.manifest.json -> ${targetVersion}`);
    }
  }
}

// 4. extensions/* DLC manifests
const extDir = path.join(root, "extensions");
if (fs.existsSync(extDir)) {
  const extFolders = fs.readdirSync(extDir).filter(f => fs.statSync(path.join(extDir, f)).isDirectory());
  for (const dlcName of extFolders) {
    const dlcFolder = path.join(extDir, dlcName);
    const dlcManifestPath = path.join(dlcFolder, "z-plugin.manifest.json");
    if (fs.existsSync(dlcManifestPath)) {
      const dlcManifest = JSON.parse(fs.readFileSync(dlcManifestPath, "utf8"));
      if (dlcManifest.version !== targetVersion) {
        dlcManifest.version = targetVersion;
        fs.writeFileSync(dlcManifestPath, JSON.stringify(dlcManifest, null, 2) + "\n", "utf8");
        console.log(`  ✓ Updated extensions/${dlcName}/z-plugin.manifest.json -> ${targetVersion}`);
      }
    }

    // Update extension package.json
    const dlcPkgPath = path.join(dlcFolder, "package.json");
    if (fs.existsSync(dlcPkgPath)) {
      const dlcPkg = JSON.parse(fs.readFileSync(dlcPkgPath, "utf8"));
      if (dlcPkg.version !== targetVersion) {
        dlcPkg.version = targetVersion;
        fs.writeFileSync(dlcPkgPath, JSON.stringify(dlcPkg, null, 2) + "\n", "utf8");
        console.log(`  ✓ Updated extensions/${dlcName}/package.json -> ${targetVersion}`);
      }
    }

    // Update version strings in index.mjs if present
    const dlcIndexPath = path.join(dlcFolder, "index.mjs");
    if (fs.existsSync(dlcIndexPath)) {
      const oldIndex = fs.readFileSync(dlcIndexPath, "utf8");
      const updatedIndex = oldIndex.replace(/version:\s*['"]\d+\.\d+\.\d+(-[a-zA-Z0-9\.\-_]+)?['"]/g, `version: '${targetVersion}'`);
      if (updatedIndex !== oldIndex) {
        fs.writeFileSync(dlcIndexPath, updatedIndex, "utf8");
        console.log(`  ✓ Updated extensions/${dlcName}/index.mjs -> ${targetVersion}`);
      }
    }
  }
}

// 5. README.md Shipped Plugins table
const readmePath = path.join(root, "README.md");
let readme = fs.readFileSync(readmePath, "utf8");
const updatedReadme = readme.replace(/\| \[?\*\*`z-[a-z]+`\*\*\]?\([^\)]+\) \| `[^`]+` \|/g, (match) => {
  return match.replace(/`\d+\.\d+\.\d+`/g, `\`${targetVersion}\``);
});
if (updatedReadme !== readme) {
  fs.writeFileSync(readmePath, updatedReadme, "utf8");
  console.log(`  ✓ Updated README.md plugin version badges -> ${targetVersion}`);
}

console.log(`[SUCCESS] All monorepo components are now synchronized to v${targetVersion}!`);
