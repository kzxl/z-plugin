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
