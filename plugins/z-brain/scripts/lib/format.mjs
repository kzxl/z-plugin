/**
 * Context-Diet Formatter for Z-Brain
 * Implements Progressive Disclosure:
 *  - Level 0 (L0): 1-line index with Gotcha/Fix. Minimal token consumption (~30-50 tokens/item).
 *  - Level 1 (L1): Compact summary with problem & fix.
 *  - Level 2 (L2): Full inspection view on demand.
 */

export function formatL0Progressive(items, taskQuery = '') {
  if (!items || items.length === 0) {
    return `[Z-BRAIN] No prior knowledge found for: "${taskQuery}". Proceeding with zero context overhead.`;
  }

  const lines = [
    `[Z-BRAIN: CONTEXT DISCLOSURE] Found ${items.length} relevant knowledge atoms:`,
    ''
  ];

  items.forEach((item, index) => {
    const trustIcon = item.trust_level === 'verified_fact' ? '🛡️ [FACT]' : (item.trust_level === 'observation' ? '👁️ [OBS]' : '💡 [HYP]');
    const tagStr = (item.tags || []).slice(0, 3).join(', ');
    const gotcha = item.gotcha_fix || item.question;

    lines.push(`[#${item.id}] ${trustIcon} [${item.project_id}] {${tagStr}}`);
    lines.push(`   └─ Gotcha/Fix: ${gotcha}`);
  });

  lines.push('');
  lines.push(`💡 To inspect full code snippets/evidence, call zbrain_view(id).`);

  return lines.join('\n');
}

export function formatDeepView(item) {
  if (!item) return '[Z-BRAIN] Item not found.';

  const tags = Array.isArray(item.tags) ? item.tags.join(', ') : item.tags;
  const evidence = Array.isArray(item.evidence) ? item.evidence.join('\n - ') : item.evidence;

  return [
    `============================================================`,
    `🧠 KNOWLEDGE ATOM #${item.id} [Project: ${item.project_id} | Scope: ${item.scope}]`,
    `============================================================`,
    `Trust Level: ${item.trust_level || 'observation'}`,
    `Tags: ${tags || 'none'}`,
    `Updated: ${item.updated_at || item.created_at}`,
    ``,
    `📌 QUESTION / PROBLEM:`,
    item.question,
    ``,
    `💡 ANSWER / SOLUTION / FIX:`,
    item.answer,
    ``,
    evidence ? `🔍 EVIDENCE & PROVENANCE:\n - ${evidence}\n` : ``,
    `============================================================`
  ].filter(Boolean).join('\n');
}

export function formatTerminalTable(items) {
  if (!items || items.length === 0) {
    return '[Z-BRAIN] No knowledge atoms found.';
  }

  const colWidths = { id: 6, trust: 7, project: 14, question: 48, tags: 18 };

  const pad = (str, len) => {
    const s = String(str || '').replace(/[\r\n]+/g, ' ');
    return s.length > len ? s.slice(0, len - 1) + '…' : s.padEnd(len);
  };

  const sep = `┌${'─'.repeat(colWidths.id + 2)}┬${'─'.repeat(colWidths.trust + 2)}┬${'─'.repeat(colWidths.project + 2)}┬${'─'.repeat(colWidths.question + 2)}┬${'─'.repeat(colWidths.tags + 2)}┐`;
  const midSep = `├${'─'.repeat(colWidths.id + 2)}┼${'─'.repeat(colWidths.trust + 2)}┼${'─'.repeat(colWidths.project + 2)}┼${'─'.repeat(colWidths.question + 2)}┼${'─'.repeat(colWidths.tags + 2)}┤`;
  const bottomSep = `└${'─'.repeat(colWidths.id + 2)}┴${'─'.repeat(colWidths.trust + 2)}┴${'─'.repeat(colWidths.project + 2)}┴${'─'.repeat(colWidths.question + 2)}┴${'─'.repeat(colWidths.tags + 2)}┘`;

  const header = `│ ${pad('ID', colWidths.id)} │ ${pad('TRUST', colWidths.trust)} │ ${pad('PROJECT', colWidths.project)} │ ${pad('QUESTION / LESSON', colWidths.question)} │ ${pad('TAGS', colWidths.tags)} │`;

  const rows = items.map(item => {
    const trust = item.trust_level === 'verified_fact' ? 'FACT' : (item.trust_level === 'observation' ? 'OBS' : 'HYP');
    const tagStr = (item.tags || []).slice(0, 3).join(',');
    const q = item.question || item.gotcha_fix || '';
    return `│ ${pad(item.id, colWidths.id)} │ ${pad(trust, colWidths.trust)} │ ${pad(item.project_id, colWidths.project)} │ ${pad(q, colWidths.question)} │ ${pad(tagStr, colWidths.tags)} │`;
  });

  return [
    `🧠 Z-Brain Knowledge Dashboard (${items.length} items):`,
    sep,
    header,
    midSep,
    ...rows,
    bottomSep,
    `💡 Use "z-brain view <id>" to view full code & evidence.`
  ].join('\n');
}

export function formatTimeline(observations) {
  if (!observations || observations.length === 0) {
    return '[Z-BRAIN] No session observations or milestones recorded.';
  }

  const lines = [
    `⏳ Z-Brain Project Timeline (${observations.length} recent events):`,
    ''
  ];

  observations.forEach(obs => {
    const dateStr = (obs.created_at || '').replace('T', ' ').slice(0, 16);
    const typeTag = `[${obs.type || 'obs'}]`;
    lines.push(` ● ${dateStr} ${typeTag} ${obs.title} (Project: ${obs.project_id})`);
    if (obs.summary) {
      lines.push(`    ├─ Summary: ${obs.summary.replace(/[\r\n]+/g, ' ')}`);
    }
    if (obs.files_touched && obs.files_touched.length > 0) {
      lines.push(`    └─ Files: ${obs.files_touched.join(', ')}`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

export function formatFileKnowledge(file, atoms, observations) {
  const lines = [
    `📂 Z-Brain File Intelligence for: "${file}"`,
    `════════════════════════════════════════════════════════════`
  ];

  if (atoms && atoms.length > 0) {
    lines.push(`🛡️ Knowledge Atoms & Gotchas (${atoms.length}):`);
    atoms.forEach(a => {
      const trust = a.trust_level === 'verified_fact' ? 'FACT' : 'OBS';
      lines.push(` • [#${a.id}] [${trust}] ${a.question}`);
      if (a.gotcha_fix) {
        lines.push(`   └─ Gotcha/Fix: ${a.gotcha_fix}`);
      }
    });
    lines.push('');
  } else {
    lines.push('🛡️ Knowledge Atoms: (none directly matching)');
    lines.push('');
  }

  if (observations && observations.length > 0) {
    lines.push(`⏳ Past Decisions & Milestones (${observations.length}):`);
    observations.forEach(o => {
      lines.push(` • [${o.type || 'obs'}] ${o.title}`);
      if (o.summary) {
        lines.push(`   └─ ${o.summary}`);
      }
    });
    lines.push('');
  } else {
    lines.push('⏳ Past Decisions: (none directly matching)');
    lines.push('');
  }

  return lines.join('\n');
}
