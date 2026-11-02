import { getDb, insertAtom } from './db.mjs';

/**
 * Harvest an atomic lesson into Z-Brain SQLite
 */
export function harvestKnowledge({
  input,
  project = 'global',
  tags = [],
  trust_level = 'observation',
  evidence = []
}) {
  const db = getDb();
  let question = '';
  let answer = '';
  let gotchaFix = '';

  if (typeof input === 'string') {
    // Format: "<problem> | <cause> | <fix>" or plain question
    const parts = input.split('|').map(s => s.trim());
    if (parts.length >= 3) {
      question = parts[0];
      const cause = parts[1];
      const fix = parts[2];
      gotchaFix = `${cause} | ${fix}`;
      answer = `Cause: ${cause}\n\nFix / Solution:\n${fix}`;
    } else if (parts.length === 2) {
      question = parts[0];
      gotchaFix = parts[1];
      answer = parts[1];
    } else {
      question = input;
      answer = input;
      gotchaFix = input.slice(0, 150);
    }
  } else if (typeof input === 'object' && input !== null) {
    question = input.question || input.problem || '';
    answer = input.answer || input.fix || '';
    gotchaFix = input.gotcha_fix || input.cause ? `${input.cause} | ${input.fix}` : null;
    if (input.project) project = input.project;
    if (input.tags) tags = input.tags;
    if (input.trust_level) trust_level = input.trust_level;
    if (input.evidence) evidence = input.evidence;
  }

  if (!question || !answer) {
    throw new Error('Valid question and answer/fix are required for harvest.');
  }

  // Ensure normalized tags
  let tagList = Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim()).filter(Boolean);
  if (!tagList.some(t => t.startsWith('project:'))) {
    tagList.push(`project:${project}`);
  }

  // Normalize evidence
  const evidenceList = Array.isArray(evidence) ? evidence : (evidence ? [String(evidence)] : []);

  const atom = {
    project_id: project.toLowerCase(),
    scope: project === 'global' ? 'global' : 'project',
    trust_level: trust_level || 'observation',
    question,
    answer,
    gotcha_fix: gotchaFix,
    tags: tagList,
    evidence: evidenceList,
    category: 'engineering_lesson',
    confidence: trust_level === 'verified_fact' ? 0.95 : 0.7
  };

  const id = insertAtom(db, atom);

  return {
    success: true,
    id,
    project: atom.project_id,
    trust_level: atom.trust_level,
    tags: tagList,
    message: `Harvested atom #${id} successfully into Z-Brain SQLite.`
  };
}
