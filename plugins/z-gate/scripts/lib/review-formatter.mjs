/**
 * Review Formatter for Z-Gate
 * Generates terminal box-drawing tables, markdown, and json reports.
 */

export function formatReviewReport(review, format = 'table') {
  if (format === 'json') {
    return JSON.stringify(review, null, 2);
  }

  if (format === 'markdown') {
    return formatMarkdownReport(review);
  }

  return formatTerminalTableReport(review);
}

function formatTerminalTableReport(review) {
  const { status, score, metrics, findings, summary } = review;

  const statusBadge = status === 'PASS' ? '✅ PASS' : (status === 'WARN' ? '⚠️  WARN' : '🛑 FAIL');
  const deltaStr = `${metrics.netChange >= 0 ? '+' : ''}${metrics.netChange} LOC (+${metrics.addedLinesCount} / -${metrics.deletedLinesCount})`;

  const colWidths = { sev: 6, file: 22, rule: 26, msg: 40 };

  const pad = (str, len) => {
    const s = String(str || '').replace(/[\r\n]+/g, ' ');
    return s.length > len ? s.slice(0, len - 1) + '…' : s.padEnd(len);
  };

  const sep = `┌${'─'.repeat(colWidths.sev + 2)}┬${'─'.repeat(colWidths.file + 2)}┬${'─'.repeat(colWidths.rule + 2)}┬${'─'.repeat(colWidths.msg + 2)}┐`;
  const midSep = `├${'─'.repeat(colWidths.sev + 2)}┼${'─'.repeat(colWidths.file + 2)}┼${'─'.repeat(colWidths.rule + 2)}┼${'─'.repeat(colWidths.msg + 2)}┤`;
  const bottomSep = `└${'─'.repeat(colWidths.sev + 2)}┴${'─'.repeat(colWidths.file + 2)}┴${'─'.repeat(colWidths.rule + 2)}┴${'─'.repeat(colWidths.msg + 2)}┘`;

  const header = `│ ${pad('SEV', colWidths.sev)} │ ${pad('LOCATION', colWidths.file)} │ ${pad('INVARIANT / RULE', colWidths.rule)} │ ${pad('FINDING & ACTIONABLE FIX', colWidths.msg)} │`;

  const rows = [];
  findings.forEach(f => {
    const sevTag = f.severity === 'P0' ? '🔴 P0' : (f.severity === 'P1' ? '🟡 P1' : (f.severity === 'P2' ? '🟣 P2' : '⚪ P3'));
    const loc = f.file === 'COMMIT_MSG' || f.file === 'METRICS' ? f.file : `${f.file}:${f.line}`;
    const brief = `${f.message} › ${f.suggestion}`;
    rows.push(`│ ${pad(sevTag, colWidths.sev)} │ ${pad(loc, colWidths.file)} │ ${pad(f.rule, colWidths.rule)} │ ${pad(brief, colWidths.msg)} │`);
  });

  const lines = [
    `🛡️  Z-GATE CODE REVIEW AUDIT REPORT`,
    `========================================================================================`,
    `Overall Verdict: ${statusBadge} | Quality & NEV Score: ${score}/100`,
    `Diff Metrics:    ${metrics.filesCount} file(s) touched | ${deltaStr}`,
    `Findings:        ${summary.p0Count} Critical (P0) | ${summary.p1Count} Warning (P1) | ${summary.p2Count} Invariant (P2) | ${summary.p3Count} Nit (P3)`,
    `========================================================================================`
  ];

  if (findings.length === 0) {
    lines.push(`\n✨ Perfect Clean Diff! Zero architectural violations, security leaks, or wrapper bloat detected.`);
  } else {
    lines.push('');
    lines.push(sep);
    lines.push(header);
    lines.push(midSep);
    lines.push(...rows);
    lines.push(bottomSep);
    lines.push(`\n💡 Tip: P0 blockers will automatically abort git commit (R_GIT, R_NEV).`);
  }

  return lines.join('\n');
}

function formatMarkdownReport(review) {
  const { status, score, metrics, findings, summary } = review;
  const statusBadge = status === 'PASS' ? '🟢 PASS' : (status === 'WARN' ? '🟡 WARN' : '🔴 FAIL');

  const lines = [
    `## 🛡️ Z-Gate Code Review Report`,
    ``,
    `| Metric | Value |`,
    `| :--- | :--- |`,
    `| **Verdict** | ${statusBadge} |`,
    `| **Quality & NEV Score** | **${score} / 100** |`,
    `| **Diff Volume** | ${metrics.filesCount} file(s), +${metrics.addedLinesCount} / -${metrics.deletedLinesCount} LOC (Net: ${metrics.netChange}) |`,
    `| **Issues Breakdown** | ${summary.p0Count} Blocker (P0), ${summary.p1Count} Warn (P1), ${summary.p2Count} Invariant (P2), ${summary.p3Count} Nit (P3) |`,
    ``
  ];

  if (findings.length === 0) {
    lines.push(`> [!NOTE]\n> All Net Engineering Value (R_NEV), Security, and Invariant checks passed with zero violations.`);
    return lines.join('\n');
  }

  lines.push(`### Detailed Findings`);
  lines.push(``);
  lines.push(`| Severity | Location | Invariant / Rule | Finding & Recommended Action |`);
  lines.push(`| :--- | :--- | :--- | :--- |`);

  findings.forEach(f => {
    const sevIcon = f.severity === 'P0' ? '🔴 **P0 (Blocker)**' : (f.severity === 'P1' ? '🟡 **P1 (Warn)**' : (f.severity === 'P2' ? '🟣 **P2 (Rule)**' : '⚪ **P3 (Nit)**'));
    const loc = f.file === 'COMMIT_MSG' || f.file === 'METRICS' ? `\`${f.file}\`` : `\`${f.file}:${f.line}\``;
    lines.push(`| ${sevIcon} | ${loc} | **${f.rule}** | ${f.message}<br>💡 *Fix:* ${f.suggestion} |`);
  });

  return lines.join('\n');
}
