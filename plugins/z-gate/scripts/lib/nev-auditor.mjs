/**
 * Net Engineering Value (NEV) & Invariants Diff Auditor for Z-Gate
 * Verifies code changes against R_NEV, R_REUSE, R_WPF, R_DB, R_PROOF, and R_GIT.
 */

import { parseDiff } from './diff-parser.mjs';

const CONVENTIONAL_COMMIT_REGEX = /^(feat|fix|refactor|test|docs|chore|perf|ci|style)(\([a-zA-Z0-9_\-\.\/]+\))?:\s.+/;

export function auditDiff({ diff = '', commitMessage = '', cwd = process.cwd(), isRefactor = null }) {
  const parsed = parseDiff(diff);
  const warnings = [];
  const checks = [];

  // Determine if task is refactoring
  const isRefactoringTask = isRefactor !== null ? isRefactor : (
    /refactor/i.test(commitMessage) ||
    /cleanup|clean\s+up|modularize|reorganize/i.test(commitMessage)
  );

  // 1. Commit Message Convention Check (R_GIT)
  if (commitMessage) {
    const firstLine = commitMessage.trim().split(/\r?\n/)[0];
    const isConventional = CONVENTIONAL_COMMIT_REGEX.test(firstLine);
    checks.push({ check: "Conventional Commit Format (R_GIT)", passed: isConventional });
    if (!isConventional) {
      warnings.push(`Commit message '${firstLine}' does not follow Conventional Commits '<type>(<scope>): <subject>' (R_GIT).`);
    }

    // 2. Anti-Aggrandizement / Subjective Self-Praise (R_PROOF)
    if (/\b(optimal|perfect|flawless|completely clean|best practice)\b/i.test(commitMessage)) {
      warnings.push("Commit message contains subjective self-praise ('optimal', 'perfect'). Citing empirical proof required (R_PROOF).");
      checks.push({ check: "Zero-Trust Empirical Proof (R_PROOF)", passed: false });
    }
  }

  // 3. Wrapper Hell & Interface Deletion Test (R_NEV, R_CORE)
  // Check if an interface was added that has exactly 1 corresponding class in the same diff
  for (const iface of parsed.interfaces) {
    const expectedClass = iface.startsWith('I') ? iface.slice(1) : iface;
    const matchingClass = parsed.classes.find(c => c.toLowerCase() === expectedClass.toLowerCase());
    if (matchingClass && parsed.interfaces.length > 0) {
      warnings.push(
        `Potential wrapper hell detected: Interface '${iface}' has only 1 implementation '${matchingClass}'. Apply Deletion Test: If no polymorphic seam or mock seam is needed, inline or delete it (R_NEV, R_CORE).`
      );
      checks.push({ check: `Interface Justification: ${iface} (R_CORE)`, passed: false });
    }
  }

  // 4. LOC Inflation & Code Bloat on Refactor (R_NEV)
  if (isRefactoringTask && parsed.addedLines.length > 0) {
    const added = parsed.addedLines.length;
    const deleted = parsed.deletedLines.length;

    // If added > deleted by more than 30%
    if (deleted > 0 && (added - deleted) / deleted > 0.3) {
      const inflationPercent = Math.round(((added - deleted) / deleted) * 100);
      warnings.push(
        `LOC Inflation in refactoring: Code expanded by +${inflationPercent}% (+${added} / -${deleted} lines). Net Engineering Value must deliver negative or neutral line growth (R_NEV).`
      );
      checks.push({ check: "Net Engineering Value (R_NEV)", passed: false });
    } else if (deleted === 0 && added > 25) {
      warnings.push(`Refactoring added ${added} lines without deleting any existing code. Verify whether this introduces wrapper bloat (R_NEV).`);
      checks.push({ check: "Net Engineering Value (R_NEV)", passed: false });
    } else {
      checks.push({ check: "Net Engineering Value (R_NEV)", passed: true });
    }
  }

  // 5. Invariant Checks on Added Lines
  let flaggedBindingSource = false;
  let flaggedSqlConcat = false;
  let flaggedSelfPraise = false;

  for (const lineObj of parsed.addedLines) {
    const code = lineObj.code;

    // A. WinForms / WPF BindingSource Violation (R_WPF)
    if (!flaggedBindingSource && /BindingSource\b/i.test(code)) {
      warnings.push(`WinForms/WPF invariant violation: STRICTLY NO BindingSource. Use BaseForm with PopulateControls/CollectData manual mapping (R_WPF). File: ${lineObj.file}`);
      checks.push({ check: "No BindingSource (R_WPF)", passed: false });
      flaggedBindingSource = true;
    }

    // B. SQL Concatenation Injection (R_DB)
    if (!flaggedSqlConcat && (/SELECT\s+.*\+\s*[$a-zA-Z0-9_]/i.test(code) || /\$\"SELECT\s+.*\{/i.test(code))) {
      warnings.push(`SQL concatenation vulnerability detected: Parameterized queries ONLY (R_DB). File: ${lineObj.file}`);
      checks.push({ check: "Database Parameterized Query Safety (R_DB)", passed: false });
      flaggedSqlConcat = true;
    }

    // C. Subjective Self-Praise in Comments (R_PROOF)
    if (!flaggedSelfPraise && /\/\/\s*.*(optimal|perfect|flawless)/i.test(code)) {
      warnings.push("Subjective self-praise comment detected ('optimal', 'perfect'). Citing Level 3+ empirical proof required (R_PROOF).");
      checks.push({ check: "Zero-Trust Proof in Code Comments (R_PROOF)", passed: false });
      flaggedSelfPraise = true;
    }
  }

  const passed = warnings.length === 0;

  return {
    passed,
    nevScore: Math.max(0, 100 - warnings.length * 25),
    warnings,
    checks,
    metrics: {
      filesChanged: parsed.files.length,
      addedLines: parsed.addedLines.length,
      deletedLines: parsed.deletedLines.length,
      netChange: parsed.netChange,
      interfacesAdded: parsed.interfaces.length,
      classesAdded: parsed.classes.length
    },
    summary: passed
      ? `Diff adheres cleanly to Net Engineering Value (NEV: 100) and repository invariants.`
      : `Diff audit flagged ${warnings.length} warning(s). NEV Score: ${Math.max(0, 100 - warnings.length * 25)}/100.`
  };
}
