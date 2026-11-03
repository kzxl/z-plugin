/**
 * Z-Brain Git Auto-Harvester
 * Automatically distills structured knowledge atoms [Problem -> Cause -> Fix]
 * from recent Git commits or diffs.
 */

import cp from 'node:child_process';
import path from 'node:path';
import { harvestKnowledge } from './harvest.mjs';
import { detectCurrentProject } from './search.mjs';

function getGitOutput(cmd, cwd) {
  try {
    return cp.execSync(cmd, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

export function harvestFromGit(db, opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const commitRef = opts.commit || 'HEAD';

  // 1. Get commit log and message
  const commitSubject = getGitOutput(`git log -1 --format=%s ${commitRef}`, cwd);
  const commitBody = getGitOutput(`git log -1 --format=%b ${commitRef}`, cwd);
  const commitHash = getGitOutput(`git log -1 --format=%h ${commitRef}`, cwd);
  const diffStat = getGitOutput(`git show --stat --oneline ${commitRef}`, cwd);
  const diffPatch = getGitOutput(`git show -p --stat ${commitRef}`, cwd).slice(0, 10000);

  if (!commitSubject) {
    return {
      success: false,
      message: 'No git commit found or not a git repository.'
    };
  }

  // 2. Distill Problem / Cause / Fix using heuristics
  let problem = commitSubject.replace(/^(fix|feat|refactor|perf|chore|test)(\([^\)]+\))?:\s*/i, '').trim();
  let cause = '';
  let fix = '';

  // Parse body if present
  if (commitBody) {
    const lines = commitBody.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const l of lines) {
      if (/^(cause|root\s*cause|reason):/i.test(l)) {
        cause = l.replace(/^(cause|root\s*cause|reason):\s*/i, '');
      } else if (/^(fix|solution|resolve|action):/i.test(l)) {
        fix = l.replace(/^(fix|solution|resolve|action):\s*/i, '');
      }
    }
  }

  // Heuristic fallbacks from diff inspection
  if (!cause) {
    if (diffPatch.includes('.Result') || diffPatch.includes('.Wait()')) {
      cause = 'Sync-over-async blocking call caused threadpool deadlock or UI freeze';
    } else if (diffPatch.includes('SELECT') && diffPatch.includes('+')) {
      cause = 'Unparameterized raw SQL concatenation was prone to injection';
    } else if (diffPatch.includes('BeginUpdate')) {
      cause = 'Batch updates without BeginUpdate caused UI grid lag and excessive repaints';
    } else {
      cause = `Commit ${commitHash} introduced changes across: ${diffStat.split('\n')[0] || 'codebase'}`;
    }
  }

  if (!fix) {
    fix = commitSubject;
  }

  // 3. Infer tags
  const tags = new Set(['git', 'auto_harvest']);
  const project = opts.project || detectCurrentProject(cwd);

  const lowerContent = (commitSubject + ' ' + commitBody + ' ' + diffStat).toLowerCase();
  if (lowerContent.includes('.cs') || lowerContent.includes('csharp')) tags.add('csharp');
  if (lowerContent.includes('.ts') || lowerContent.includes('.tsx') || lowerContent.includes('react')) tags.add('react');
  if (lowerContent.includes('wpf')) tags.add('wpf');
  if (lowerContent.includes('winforms') || lowerContent.includes('devexpress')) tags.add('winforms');
  if (lowerContent.includes('order') || lowerContent.includes('donhang')) tags.add('sales');
  if (lowerContent.includes('inventory') || lowerContent.includes('stock') || lowerContent.includes('kho')) tags.add('inventory');
  if (lowerContent.includes('deadlock') || lowerContent.includes('async')) tags.add('async');
  if (lowerContent.includes('refactor')) tags.add('refactor');
  if (lowerContent.includes('security') || lowerContent.includes('sqli')) tags.add('security');

  // 4. Save into SQLite
  const result = harvestKnowledge({
    input: {
      problem,
      cause,
      fix
    },
    project,
    tags: Array.from(tags),
    trust_level: 'verified_fact'
  });

  return {
    success: true,
    atom: result.atom,
    deduplicated: result.deduplicated,
    message: `Harvested atom #${result.atom?.id || result.id || 1} from commit ${commitHash}: [${problem.slice(0, 50)}...]`
  };
}
