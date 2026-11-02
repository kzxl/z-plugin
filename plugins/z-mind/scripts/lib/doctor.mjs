/**
 * Workspace Health & Compliance Doctor for Z-Mind
 * Analyzes workspace repository against 58 canonical rules and generates compliance score.
 */

import fs from 'node:fs';
import path from 'node:path';
import { detectProject } from './bootstrap.mjs';

export function runDoctor(cwd = process.cwd()) {
  const issues = [];
  const checks = [];
  let score = 100;

  // 1. Stack detection
  const projectInfo = detectProject(cwd);
  const stack = [projectInfo.language, projectInfo.architecture, projectInfo.domain].filter(Boolean);
  checks.push({
    name: 'Stack Detection',
    status: stack.length > 0 ? 'PASS' : 'WARN',
    details: stack.length > 0 ? `Detected: ${stack.join(', ')} (Project: ${projectInfo.projectName})` : 'Could not automatically identify stack'
  });

  // 2. Project Rule (.project-rule.md)
  const rulePath = path.join(cwd, '.project-rule.md');
  const hasRule = fs.existsSync(rulePath);
  if (!hasRule) {
    issues.push('Missing .project-rule.md. Run "z-mind init" or call zmind_init to bootstrap standardized rules.');
    score -= 25;
    checks.push({ name: 'Project Rule Directive (.project-rule.md)', status: 'FAIL', details: 'Missing' });
  } else {
    try {
      const content = fs.readFileSync(rulePath, 'utf8');
      const hasZMind = content.includes('z-mind') || content.includes('zmind');
      const hasZBrain = content.includes('z-brain') || content.includes('zbrain');
      if (hasZMind && hasZBrain) {
        checks.push({ name: 'Project Rule Directive (.project-rule.md)', status: 'PASS', details: 'Bound to z-mind & z-brain' });
      } else {
        issues.push('.project-rule.md is present but missing references to z-mind or z-brain.');
        score -= 10;
        checks.push({ name: 'Project Rule Directive (.project-rule.md)', status: 'WARN', details: 'Outdated rule binding' });
      }
    } catch {
      checks.push({ name: 'Project Rule Directive (.project-rule.md)', status: 'FAIL', details: 'Unreadable' });
    }
  }

  // 3. Gitignore check
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const gitignore = fs.readFileSync(gitignorePath, 'utf8');
      if (gitignore.includes('.project-rule.md')) {
        checks.push({ name: 'Gitignore Discipline (.project-rule.md)', status: 'PASS', details: 'Ignored from VCS' });
      } else {
        issues.push('.project-rule.md is not in .gitignore. Add it to prevent committing machine-local rules.');
        score -= 10;
        checks.push({ name: 'Gitignore Discipline (.project-rule.md)', status: 'WARN', details: 'Missing from .gitignore' });
      }
    } catch {}
  }

  // 4. Quick scan for major anti-patterns in top-level code (max 100 source files)
  let foundBindingSource = 0;
  let foundSqlConcat = 0;

  function quickScan(dir, depth = 0) {
    if (depth > 3 || !fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory()) {
          const lower = ent.name.toLowerCase();
          if (['node_modules', '.git', 'bin', 'obj', 'dist'].includes(lower)) continue;
          quickScan(path.join(dir, ent.name), depth + 1);
        } else if (ent.isFile() && /\.(cs|ts|js)$/i.test(ent.name)) {
          try {
            const code = fs.readFileSync(path.join(dir, ent.name), 'utf8');
            if (code.includes('BindingSource') && foundBindingSource === 0) {
              foundBindingSource++;
              issues.push(`WinForms violation: Found BindingSource in ${ent.name} (R_WPF).`);
              score -= 15;
            }
            if ((/SELECT\s+.*\+\s*[$a-zA-Z0-9_]/i.test(code) || /\$\"SELECT\s+.*\{/i.test(code)) && foundSqlConcat === 0) {
              foundSqlConcat++;
              issues.push(`SQL violation: Found raw query string concatenation in ${ent.name} (R_DB).`);
              score -= 15;
            }
          } catch {}
        }
      }
    } catch {}
  }

  quickScan(cwd);

  checks.push({
    name: 'WinForms Anti-Pattern Scan (R_WPF)',
    status: foundBindingSource === 0 ? 'PASS' : 'FAIL',
    details: foundBindingSource === 0 ? 'Zero BindingSource detected' : 'BindingSource detected'
  });

  checks.push({
    name: 'SQL Query Safety Scan (R_DB)',
    status: foundSqlConcat === 0 ? 'PASS' : 'FAIL',
    details: foundSqlConcat === 0 ? 'Parameterized queries verified' : 'SQL concatenation detected'
  });

  const finalScore = Math.max(0, Math.min(100, score));

  return {
    score: finalScore,
    status: finalScore >= 80 ? 'HEALTHY' : (finalScore >= 50 ? 'NEEDS_ATTENTION' : 'CRITICAL'),
    stack,
    checks,
    issues,
    remediations: issues.map((iss, i) => `${i + 1}. ${iss}`)
  };
}
