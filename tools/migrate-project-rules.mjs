#!/usr/bin/env node
/**
 * Project Rule Migrator: Upgrades legacy .project-rule.md files to the modern z-plugin ecosystem.
 * 
 * Replaces:
 * - agent_option_root / [AgentOption] -> z-mind plugin
 * - SemanticBrain scripts (context-fetch, post-task, git-safe-commit) -> z-brain & R_GIT
 */

import fs from "node:fs";
import path from "node:path";

const targetDirs = process.argv.slice(2);
const searchRoots = targetDirs.length > 0 ? targetDirs : [
  "E:/00.ERP",
  "E:/05.HelpDesk",
  "E:/15. Other",
  "E:/Xamp/htdocs"
];

function findProjectRuleFiles(dir, maxDepth = 4, currentDepth = 0) {
  const results = [];
  if (currentDepth > maxDepth) return results;

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === ".git" || ent.name === "node_modules" || ent.name === "bin" || ent.name === "obj") continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        results.push(...findProjectRuleFiles(full, maxDepth, currentDepth + 1));
      } else if (ent.isFile() && ent.name === ".project-rule.md") {
        results.push(full);
      }
    }
  } catch (err) {
    // Skip inaccessible folders
  }
  return results;
}

function migrateRuleContent(content) {
  let updated = content;

  // 1. Framework references
  updated = updated.replace(/agent_option_root:\s*["']?[^"'\n\r]+["']?/g, 'plugin: "z-mind"');
  updated = updated.replace(/\[AgentOption\]\/standards\/([a-zA-Z0-9_\-\.]+)/g, 'z-mind standard ($1)');
  updated = updated.replace(/\[AgentOption\]\/skills\/([a-zA-Z0-9_\-\.\/]+)/g, 'z-mind skill ($1)');
  updated = updated.replace(/node\s+E:\\+16\.\s+AgentOption\\+tools\\+lookup\.js\s+([a-zA-Z0-9_]+)/g, 'zmind_rules $1');

  // 2. Pre-fetch commands
  updated = updated.replace(/node\s+E:\\+Tools\\+SemanticBrain\\+tools\\+(?:context-fetch|find-qa-context)\.js\s+"([^"]+)"[^\n\r]*/g, 
    'zbrain_fetch(task: "$1") (or: node ~/.gemini/config/plugins/z-brain/scripts/cli.mjs fetch "$1")');

  // 3. Post-harvest commands
  updated = updated.replace(/node\s+E:\\+Tools\\+SemanticBrain\\+tools\\+(?:auto-post-task|post-task)\.js\s+"([^"]+)"[^\n\r]*/g, 
    'zbrain_harvest(lesson: "$1") (or: node ~/.gemini/config/plugins/z-brain/scripts/cli.mjs harvest "$1")');

  // 4. Git safe commit
  updated = updated.replace(/node\s+E:\\+Tools\\+SemanticBrain\\+tools\\+git-safe-commit\.js\s+-m\s+"([^"]+)"[^\n\r]*/g, 
    'git commit -m "$1" (enforcing R_GIT Conventional Commits)');

  // 5. Header references
  updated = updated.replace(/## 1\. Agent Runtime Configuration \(Semantic Brain & Git Guard\)/g, 
    '## 1. Agent Runtime Configuration (Z-Plugin Suite: z-brain, z-mind, z-token)');

  return updated;
}

console.log(`[MIGRATE] Scanning directories for .project-rule.md...`);
let totalFound = 0;
let totalUpdated = 0;

for (const root of searchRoots) {
  if (!fs.existsSync(root)) continue;
  const files = findProjectRuleFiles(root);
  totalFound += files.length;

  for (const file of files) {
    try {
      const orig = fs.readFileSync(file, "utf8");
      const migrated = migrateRuleContent(orig);
      if (migrated !== orig) {
        fs.writeFileSync(file, migrated, "utf8");
        console.log(`  ✓ Upgraded: ${file}`);
        totalUpdated++;
      } else {
        console.log(`  - Already up-to-date: ${file}`);
      }
    } catch (e) {
      console.error(`  ✗ Error updating ${file}: ${e.message}`);
    }
  }
}

console.log(`\n[COMPLETE] Scanned ${totalFound} files: ${totalUpdated} upgraded, ${totalFound - totalUpdated} already current.`);
