/**
 * Z-Gate Unified Code Review Engine
 * Deep multi-dimensional differential reviewer combining:
 *  - P0: Critical Security & Invariants (SQLi, Secrets, Cmd Injection, BindingSource)
 *  - P1: Concurrency & Async Deadlock Defense (.Result, async void, Thread.Sleep, N+1 queries)
 *  - P2: Net Engineering Value & Architecture (Single-impl interfaces, LOC inflation, deep nesting)
 *  - P3: Cross-Plugin Historical Regression (Queries z-brain for touched file gotchas)
 *  - P4: Software Craftsmanship & Asset Reuse (UI Anti-Slop, Helper Discovery)
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { parseDiff } from './diff-parser.mjs';
import { findHelpers } from './helper-discovery.mjs';

const CONVENTIONAL_COMMIT_REGEX = /^(feat|fix|refactor|test|docs|chore|perf|ci|style)(\([a-zA-Z0-9_\-\.\/]+\))?:\s.+/;

export const customLineReviewers = [];

/**
 * Register custom line reviewers contributed by extension DLCs (e.g. dlc-erp)
 */
export function registerLineReviewer(reviewerFn) {
  if (typeof reviewerFn === 'function' && !customLineReviewers.includes(reviewerFn)) {
    customLineReviewers.push(reviewerFn);
  }
}

/**
 * Clear all registered custom line reviewers (used by hot-reload to prevent duplicates)
 */
export function clearCustomLineReviewers() {
  customLineReviewers.length = 0;
}

/**
 * Safely lookup past gotchas for modified files from z-brain via Service Registry / Mesh
 */
async function lookupBrainGotchas(files) {
  const gotchas = [];
  try {
    let brainModule = null;

    // 1. Check Service Registry if active
    try {
      const { defaultServiceRegistry, autoBootstrapCoreServices } = await import('../../../../packages/z-runtime/src/service-registry.mjs');
      if (typeof autoBootstrapCoreServices === 'function') {
        await autoBootstrapCoreServices(defaultServiceRegistry);
      }
      const knowledgeEngine = defaultServiceRegistry.get('IKnowledgeEngine') || defaultServiceRegistry.get('z-brain');
      if (knowledgeEngine && typeof knowledgeEngine.getKnowledgeByFile === 'function') {
        for (const file of files) {
          const basename = path.basename(file);
          if (basename.length > 3) {
            const res = await knowledgeEngine.getKnowledgeByFile(basename, { limit: 2 });
            if (res && res.atoms && res.atoms.length > 0) {
              for (const atom of res.atoms) {
                gotchas.push({
                  file,
                  atomId: atom.id,
                  gotcha: atom.gotcha_fix || atom.question,
                  trustLevel: atom.trust_level
                });
              }
            }
          }
        }
        return gotchas;
      }
    } catch {}

    // 2. Discover via environment or standard installed plugin locations
    const homeDir = os.homedir();
    const candidatePaths = [
      process.env.ZBRAIN_MODULE_PATH,
      path.resolve(homeDir, '.gemini', 'config', 'plugins', 'z-brain', 'scripts', 'lib', 'db.mjs'),
      path.resolve(homeDir, '.zcode', 'plugins', 'z-brain', 'scripts', 'lib', 'db.mjs'),
      path.resolve(import.meta.dirname || path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'z-brain', 'scripts', 'lib', 'db.mjs')
    ].filter(Boolean);

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        brainModule = await import(pathToFileURL(p).href);
        break;
      }
    }

    if (brainModule && typeof brainModule.getDb === 'function') {
      const db = brainModule.getDb();
      for (const file of files) {
        const basename = path.basename(file);
        if (basename.length > 3) {
          const res = brainModule.getKnowledgeByFile(db, basename, { limit: 2 });
          if (res && res.atoms && res.atoms.length > 0) {
            for (const atom of res.atoms) {
              gotchas.push({
                file,
                atomId: atom.id,
                gotcha: atom.gotcha_fix || atom.question,
                trustLevel: atom.trust_level
              });
            }
          }
        }
      }
    }
  } catch {}
  return gotchas;
}

/**
 * Safely analyze Blast Radius & God Node sensitivity via z-token call graph
 */
async function analyzeBlastRadius(files, addedLines, cwd) {
  const blastFindings = [];
  try {
    let getBlastRadiusFn = null;
    try {
      const tokenMod = await import('../../../z-token/scripts/lib/symbol-cache.mjs');
      getBlastRadiusFn = tokenMod.getBlastRadius;
    } catch {}

    if (typeof getBlastRadiusFn !== 'function') return blastFindings;

    const targetSymbols = new Set();
    for (const l of addedLines) {
      const code = l.code;
      const methodMatch = code.match(/(?:public|private|protected|internal|static|async|virtual|override)\s+(?:[\w<>[\],.?*&]+\s+)+([A-Za-z_$][\w$]*)\s*\(/);
      if (methodMatch) targetSymbols.add(methodMatch[1]);
      const fnMatch = code.match(/\b(?:function|def|defp|defn|func|fn)\s+([A-Za-z_$][\w$]*)/);
      if (fnMatch) targetSymbols.add(fnMatch[1]);
      const clsMatch = code.match(/\b(?:class|interface|record)\s+([A-Za-z_$][\w$]*)/);
      if (clsMatch) targetSymbols.add(clsMatch[1]);
    }

    const analyzed = new Set();
    for (const sym of targetSymbols) {
      if (analyzed.has(sym.toLowerCase())) continue;
      analyzed.add(sym.toLowerCase());

      const res = getBlastRadiusFn(cwd, sym);
      if (res && !res.error) {
        if (res.isGodNode) {
          blastFindings.push({
            severity: 'P0',
            category: 'BLAST_RADIUS',
            file: res.definingFiles[0] || 'GRAPH',
            line: 1,
            rule: 'God Node Modification Hazard (Graphify Blast Radius)',
            message: `High architectural risk: '${sym}' is a God Node with total degree ${res.totalDegree} (calls/called by ${res.impactedSymbols?.length || 0} symbols across ${res.impactedFiles?.length || 0} files).`,
            suggestion: `Ensure thorough regression tests covering all ${res.impactedFiles?.length || 0} downstream/upstream files before modifying this central hub.`
          });
        } else if (res.impactedFiles && res.impactedFiles.length >= 4) {
          blastFindings.push({
            severity: 'P1',
            category: 'BLAST_RADIUS',
            file: res.definingFiles[0] || 'GRAPH',
            line: 1,
            rule: 'Wide Blast Radius Impact (Graphify Blast Radius)',
            message: `Wide blast radius: Modifying '${sym}' impacts ${res.impactedFiles.length} files (${res.impactedFiles.slice(0, 3).join(', ')}...).`,
            suggestion: `Run integration tests across impacted modules: ${res.impactedFiles.slice(0, 4).join(', ')}.`
          });
        }
      }
    }
  } catch {}

  return blastFindings;
}

/**
 * Main review function
 */
export async function reviewCode({
  diff = '',
  commitMessage = '',
  cwd = process.cwd(),
  isRefactor = null,
  focus = 'all'
}) {
  const parsed = parseDiff(diff);
  const findings = [];
  const metrics = {
    filesCount: parsed.files.length,
    addedLinesCount: parsed.addedLines.length,
    deletedLinesCount: parsed.deletedLines.length,
    netChange: parsed.netChange,
    locRatio: parsed.locRatio
  };

  const isRefactoringTask = isRefactor !== null ? isRefactor : (
    /refactor/i.test(commitMessage) ||
    /cleanup|clean\s+up|modularize|reorganize/i.test(commitMessage)
  );

  // -------------------------------------------------------------
  // 1. Commit Message Auditing (R_GIT & R_PROOF)
  // -------------------------------------------------------------
  if (commitMessage && (focus === 'all' || focus === 'git')) {
    const firstLine = commitMessage.trim().split(/\r?\n/)[0];
    if (!CONVENTIONAL_COMMIT_REGEX.test(firstLine)) {
      findings.push({
        severity: 'P3',
        category: 'R_GIT',
        file: 'COMMIT_MSG',
        line: 1,
        rule: 'Conventional Commits',
        message: `Commit subject '${firstLine}' does not follow Conventional Commits format '<type>(<scope>): <subject>'.`,
        suggestion: 'Format as feat(scope): message, fix(scope): message, or refactor(scope): message.'
      });
    }

    if (/\b(optimal|perfect|flawless|completely clean|best practice)\b/i.test(commitMessage)) {
      findings.push({
        severity: 'P1',
        category: 'R_PROOF',
        file: 'COMMIT_MSG',
        line: 1,
        rule: 'Zero-Trust Empirical Proof',
        message: "Commit message contains subjective self-praise ('optimal', 'perfect').",
        suggestion: 'Cite Level 3+ empirical proof instead: test assertion counts, compiler exit code 0, or profiler delta.'
      });
    }
  }

  // -------------------------------------------------------------
  // 2. Line-by-Line AST & Heuristics Inspection on Added Lines
  // -------------------------------------------------------------
  let currentFile = '';
  let lineIndex = 0;
  let inAsyncMethod = false;

  for (const lineObj of parsed.addedLines) {
    lineIndex++;
    currentFile = lineObj.file || 'unknown';
    const code = lineObj.code;
    const trimmed = code.trim();

    // Track async context
    if (/\basync\s+[A-Za-z0-9_<>]+\s+[A-Za-z0-9_]+\s*\(/.test(trimmed)) {
      inAsyncMethod = true;
    }
    if (trimmed.startsWith('}') && inAsyncMethod) {
      inAsyncMethod = false;
    }

    // A. [P0] SQL Injection / String Concatenation in Queries (R_DB)
    if (focus === 'all' || focus === 'security') {
      if (/(\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b).*\+\s*[$a-zA-Z0-9_]/i.test(code) ||
          /\$\"(\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b).*\{/i.test(code)) {
        findings.push({
          severity: 'P0',
          category: 'SECURITY',
          file: currentFile,
          line: lineIndex,
          rule: 'Database Parameterization (R_DB)',
          message: 'Raw SQL concatenation or string interpolation detected.',
          suggestion: 'Use parameterized queries (@param, SqlParameter, Dapper args) to eliminate SQL injection vulnerabilities.'
        });
      }

      // B. [P0] Hardcoded Secrets / Tokens
      const secretMatch = code.match(/\b(api_key|apikey|secret|password|passwd|private_key|token)\s*[:=]\s*["']([A-Za-z0-9_\-\.]{12,})["']/i) ||
                          code.match(/\b(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{20,}|AKIA[0-9A-Z]{16})\b/);
      if (secretMatch) {
        findings.push({
          severity: 'P0',
          category: 'SECURITY',
          file: currentFile,
          line: lineIndex,
          rule: 'Secret Leak Prevention',
          message: `Potential hardcoded credential or token detected: "${secretMatch[1]}".`,
          suggestion: 'Extract credentials to environment variables, .env, or cloud secret manager.'
        });
      }

      // C. [P0] Command Injection via shell execution
      if (/\b(exec|execSync|system)\s*\(\s*[`"'].*\+/i.test(code) ||
          /\bProcess\.Start\s*\([^)]*\+/i.test(code)) {
        findings.push({
          severity: 'P0',
          category: 'SECURITY',
          file: currentFile,
          line: lineIndex,
          rule: 'Command Injection Defense',
          message: 'Shell command execution using string concatenation.',
          suggestion: 'Use structured argument arrays: spawn(cmd, [arg1, arg2]) without shell evaluation.'
        });
      }

      // D. [P0] WinForms/WPF BindingSource Invariant (R_WPF)
      if (/\bBindingSource\b/i.test(code)) {
        findings.push({
          severity: 'P0',
          category: 'INVARIANT',
          file: currentFile,
          line: lineIndex,
          rule: 'WinForms / WPF Invariant (R_WPF)',
          message: 'Usage of BindingSource is strictly forbidden.',
          suggestion: 'Use BaseForm with explicit PopulateControls() and CollectData() manual mapping.'
        });
      }
    }

    // E. [P1] Concurrency & Async Deadlock Defense (.Result, .Wait(), async void)
    if (focus === 'all' || focus === 'performance' || focus === 'concurrency') {
      if (/\.(Result|GetAwaiter\(\)\.GetResult\(\)|Wait\(\))\b/.test(trimmed) &&
          !/Task\.WhenAll|Task\.WhenAny/.test(trimmed)) {
        findings.push({
          severity: 'P1',
          category: 'CONCURRENCY',
          file: currentFile,
          line: lineIndex,
          rule: 'Async/Await Deadlock Defense (R_CS, R_ASYNC)',
          message: `Sync-over-async blocking call '${trimmed.slice(0, 45)}' detected.`,
          suggestion: 'Use "await" throughout the entire call stack. Blocking on Tasks causes threadpool starvation and desktop UI freezes.'
        });
      }

      if (/async\s+void\s+([A-Za-z0-9_]+)\s*\(/.test(trimmed) &&
          !/(EventHandler|_Click|_Load|_Checked|_Closing|_Changed)\b/.test(trimmed)) {
        findings.push({
          severity: 'P1',
          category: 'CONCURRENCY',
          file: currentFile,
          line: lineIndex,
          rule: 'Async Void Hazard (R_CS)',
          message: 'Async void method detected on non-event handler.',
          suggestion: 'Return Task instead of void so caller can await and catch unhandled exceptions without process crash.'
        });
      }

      if (/Thread\.Sleep\s*\(/.test(trimmed) && inAsyncMethod) {
        findings.push({
          severity: 'P1',
          category: 'PERFORMANCE',
          file: currentFile,
          line: lineIndex,
          rule: 'Non-Blocking Async Delay',
          message: 'Thread.Sleep called inside async execution flow.',
          suggestion: 'Replace Thread.Sleep with await Task.Delay(...) to avoid blocking the OS thread.'
        });
      }

      // ERP-DECIMAL: Monetary / Price field declared as float/double
      const decimalMatch = code.match(/\b(double|float)\s+(Price|Amount|Cost|UnitPrice|SubTotal|Total|DonGia|ThanhTien|TongTien|GiaVon|GiaBan|TaxAmount|DiscountAmount)\b/i);
      if (decimalMatch) {
        findings.push({
          severity: 'P1',
          category: 'DOMAIN_ERP',
          file: currentFile,
          line: lineIndex,
          rule: 'ERP Financial Precision (R_ERP_GATE)',
          message: `Monetary field '${decimalMatch[2]}' declared as '${decimalMatch[1]}'.`,
          suggestion: 'Use "decimal" for all financial, currency, and pricing fields to prevent binary IEEE-754 floating point rounding errors.'
        });
      }

      // ERP-LOCK: Stock/Inventory update without row lock or transaction hint
      if (/\bUPDATE\s+(?:Inventory|Stock|TonKho|SoKho|KhoVatTu)\b/i.test(code) &&
          !/(?:UPDLOCK|ROWLOCK|WITH\s*\(UPDLOCK\))/i.test(code)) {
        findings.push({
          severity: 'P1',
          category: 'DOMAIN_ERP',
          file: currentFile,
          line: lineIndex,
          rule: 'ERP Inventory Lock Protection (R_ERP_GATE)',
          message: 'Direct UPDATE on inventory/stock table without explicit row-level lock (UPDLOCK).',
          suggestion: 'Append WITH (UPDLOCK, ROWLOCK) and ensure an ambient transaction scope to prevent race-condition negative stock allocations.'
        });
      }
    }

    // F. [P2] UI Software Craftsmanship & Anti-Slop (R_ANTI_SLOP)
    if ((focus === 'all' || focus === 'ui') && /\.(tsx|jsx|html|xaml|vue|svelte)$/i.test(currentFile)) {
      if (/from-(purple|indigo|pink)-[45]00\s+to-(indigo|pink|purple)-[45]00/i.test(code)) {
        findings.push({
          severity: 'P2',
          category: 'CRAFTSMANSHIP',
          file: currentFile,
          line: lineIndex,
          rule: 'AI Slop UI Defense (R_ANTI_SLOP, AS-2)',
          message: 'Cliché neon gradient detected (purple-500 to indigo-500).',
          suggestion: 'Use solid theme background with crisp border: bg-card border border-border.'
        });
      }

      if (/onClick=\{?\s*\(\)\s*=>\s*\{\s*\}?\s*\}/.test(code)) {
        findings.push({
          severity: 'P2',
          category: 'CRAFTSMANSHIP',
          file: currentFile,
          line: lineIndex,
          rule: 'Dead Click Handler (AS-5)',
          message: 'Interactive button with empty dead click handler onClick={() => {}}.',
          suggestion: 'Provide real action handler or mark button disabled: disabled aria-disabled="true".'
        });
      }
    }

    // G. Custom DLC Review Checks (extensible review hooks)
    for (const rev of customLineReviewers) {
      try {
        const finding = rev(code, currentFile, lineIndex);
        if (finding) findings.push(finding);
      } catch {}
    }

    // G. [P3] Cognitive Complexity: Excessive Indentation
    const indentMatch = code.match(/^(\s+)/);
    if (indentMatch && indentMatch[1].length >= 20) {
      findings.push({
        severity: 'P3',
        category: 'CLEAN_CODE',
        file: currentFile,
        line: lineIndex,
        rule: 'Cognitive Complexity (R_NEV)',
        message: `Deep nesting detected (indentation depth ${indentMatch[1].length / 4} levels).`,
        suggestion: 'Flatten nested if/else blocks using early returns / guard clauses.'
      });
    }
  }

  // -------------------------------------------------------------
  // 3. Architectural Wrapper Hell & Net Engineering Value (R_NEV)
  // -------------------------------------------------------------
  if (focus === 'all' || focus === 'architecture') {
    for (const iface of parsed.interfaces) {
      const expectedClass = iface.startsWith('I') ? iface.slice(1) : iface;
      const matchingClass = parsed.classes.find(c => c.toLowerCase() === expectedClass.toLowerCase());
      if (matchingClass && parsed.interfaces.length > 0) {
        findings.push({
          severity: 'P1',
          category: 'ARCHITECTURE',
          file: currentFile,
          line: 1,
          rule: 'Single-Implementation Interface (R_NEV, R_CORE)',
          message: `Wrapper hell risk: Interface '${iface}' has only 1 implementation '${matchingClass}'.`,
          suggestion: `Apply Deletion Test: Delete '${iface}' and inject '${matchingClass}' directly unless 2+ concrete implementations or mock seams are required.`
        });
      }
    }

    if (isRefactoringTask && parsed.addedLines.length > 0) {
      const added = parsed.addedLines.length;
      const deleted = parsed.deletedLines.length;

      if (deleted > 0 && (added - deleted) / deleted > 0.3) {
        const inflation = Math.round(((added - deleted) / deleted) * 100);
        findings.push({
          severity: 'P1',
          category: 'R_NEV',
          file: 'METRICS',
          line: 1,
          rule: 'Net Engineering Value LOC Inflation',
          message: `Refactoring expanded code by +${inflation}% (+${added} / -${deleted} lines).`,
          suggestion: 'Net Engineering Value must deliver negative or neutral line growth (R_NEV). Prune wrapper overhead.'
        });
      }
    }
  }

  // -------------------------------------------------------------
  // 4. Cross-Plugin Mesh: Historical Regression Lookup (z-brain)
  // -------------------------------------------------------------
  if (focus === 'all' || focus === 'regression') {
    const brainGotchas = await lookupBrainGotchas(parsed.files);
    for (const g of brainGotchas) {
      findings.push({
        severity: 'P2',
        category: 'HISTORICAL_REGRESSION',
        file: g.file,
        line: 1,
        rule: `Z-Brain Historical Gotcha Guard [#${g.atomId}]`,
        message: `File was previously involved in regression: "${g.gotcha.slice(0, 100)}..."`,
        suggestion: `Verify that changes do not reintroduce past failure mode (z-brain view ${g.atomId}).`
      });
    }
  }

  // -------------------------------------------------------------
  // 5. Cross-Plugin Mesh: Graphify Blast Radius & God Node Detection (z-token)
  // -------------------------------------------------------------
  if (focus === 'all' || focus === 'architecture' || focus === 'blast') {
    const blastFindings = await analyzeBlastRadius(parsed.files, parsed.addedLines, cwd);
    for (const b of blastFindings) {
      findings.push(b);
    }
  }

  // -------------------------------------------------------------
  // 6. Score Calculation
  // -------------------------------------------------------------
  let score = 100;
  for (const f of findings) {
    if (f.severity === 'P0') score -= 30;
    else if (f.severity === 'P1') score -= 15;
    else if (f.severity === 'P2') score -= 10;
    else if (f.severity === 'P3') score -= 5;
  }
  score = Math.max(0, Math.min(100, score));

  const hasP0 = findings.some(f => f.severity === 'P0');
  const status = hasP0 ? 'FAIL' : (score >= 80 ? 'PASS' : (score >= 60 ? 'WARN' : 'FAIL'));

  return {
    passed: status === 'PASS' || status === 'WARN',
    status,
    score,
    metrics,
    findings,
    summary: {
      p0Count: findings.filter(f => f.severity === 'P0').length,
      p1Count: findings.filter(f => f.severity === 'P1').length,
      p2Count: findings.filter(f => f.severity === 'P2').length,
      p3Count: findings.filter(f => f.severity === 'P3').length
    }
  };
}
