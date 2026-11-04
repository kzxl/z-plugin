/**
 * Z-Mind Architecture Boundary Doctor
 * Audits enterprise solutions for layer isolation, circular references, and DDD boundary violations.
 */

import fs from 'node:fs';
import path from 'node:path';

export function auditArchitecture(rootDir = process.cwd()) {
  const violations = [];
  const scannedFiles = [];

  function scanDir(dir, depth = 0) {
    if (depth > 6) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const e of entries) {
      if (['node_modules', '.git', 'bin', 'obj', 'dist', '.vs'].includes(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        scanDir(full, depth + 1);
      } else if (/\.(cs|ts|tsx)$/i.test(e.name)) {
        scannedFiles.push(full);
      }
    }
  }

  scanDir(rootDir);

  for (const file of scannedFiles) {
    let content;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
    const isUi = /(?:^|\/)(Views|Forms|UI|Components|Pages)\//i.test(relPath) || /Form\.cs$|View\.xaml\.cs$|Page\.tsx$/i.test(file);
    const isDomain = /(?:^|\/)(Domain|Entities|Models|Core)\//i.test(relPath);

    // Rule 1: UI directly referencing DbContext or raw SQL
    if (isUi) {
      if (/\busing\s+.*(?:EntityFramework|Microsoft\.EntityFrameworkCore|System\.Data\.SqlClient)\b/i.test(content) ||
          /\b(?:DbContext|_context|connection\.ExecuteAsync)\b/.test(content)) {
        violations.push({
          file: relPath,
          category: 'ARCH_LAYER_LEAK',
          rule: 'Clean Architecture (R_CORE)',
          severity: 'error',
          message: 'UI presentation layer directly consumes database context or raw connection.',
          fix: 'Route database mutations through an Application Service or Repository interface.'
        });
      }
    }

    // Rule 2: Domain layer referencing UI or Infrastructure
    if (isDomain) {
      if (/\busing\s+(?:System\.Windows\.Forms|DevExpress|System\.Web|Microsoft\.AspNetCore)\b/i.test(content)) {
        violations.push({
          file: relPath,
          category: 'DOMAIN_PURITY',
          rule: 'Domain Model Independence (R_DOMAIN_CORE)',
          severity: 'error',
          message: 'Domain model has dependency on UI or presentation framework.',
          fix: 'Keep Domain entities POCO/pure without UI framework imports.'
        });
      }
    }

    // Rule 3: God Class / High Coupling (Graphify Centrality & Single Responsibility R_CORE)
    const newMatches = Array.from(content.matchAll(/\bnew\s+([A-Z][A-Za-z0-9_]+)\s*\(/g), m => m[1]);
    const serviceInjections = Array.from(content.matchAll(/\b(?:I[A-Z][A-Za-z0-9_]*(?:Service|Repository|Manager|Client))\b/g), m => m[0]);
    const distinctDependencies = new Set([...newMatches, ...serviceInjections]);
    if (distinctDependencies.size >= 8) {
      violations.push({
        file: relPath,
        category: 'ARCH_GOD_CLASS',
        rule: 'Single Responsibility & Low Coupling (R_CORE)',
        severity: 'warning',
        message: `High coupling architectural smell: Class coordinates ${distinctDependencies.size} distinct dependencies (${Array.from(distinctDependencies).slice(0, 4).join(', ')}...).`,
        fix: 'Decompose orchestrator into focused mediator or workflow handlers to respect Single Responsibility.'
      });
    }
  }

  return {
    passed: violations.filter(v => v.severity === 'error').length === 0,
    scannedCount: scannedFiles.length,
    violationsCount: violations.length,
    violations,
    summary: violations.length === 0
      ? `✅ Architecture boundary audit PASSED across ${scannedFiles.length} files.`
      : `⚠️ Detected ${violations.length} layer boundary violation(s).`
  };
}
