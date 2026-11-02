import { getDb, insertAtom, updateAtom } from './db.mjs';

function findSimilarAtom(db, question, projectId) {
  const cleanQ = question.trim().toLowerCase();
  const exact = db.prepare('SELECT id, question, trust_level, evidence, tags FROM knowledge_atoms WHERE project_id = ? AND LOWER(question) = ?').get(projectId, cleanQ);
  if (exact) return exact;

  const prefix = cleanQ.slice(0, 45);
  if (prefix.length >= 25) {
    const near = db.prepare('SELECT id, question, trust_level, evidence, tags FROM knowledge_atoms WHERE project_id = ? AND LOWER(question) LIKE ?').get(projectId, `${prefix}%`);
    if (near) return near;
  }
  return null;
}

/**
 * Harvest an atomic lesson into Z-Brain SQLite
 * Supports:
 *  - 3-part string: "<problem> | <cause> | <fix>"
 *  - Single atom object: { problem, cause, fix, tags, trust_level }
 *  - Multi-atom batch: [{...}, {...}] or { atoms: [...] }
 */
export function harvestKnowledge({
  input,
  project = 'global',
  tags = [],
  trust_level = 'observation',
  evidence = []
}) {
  const db = getDb();

  // Support batch array or { atoms: [...] }
  const atomList = Array.isArray(input) ? input : (input?.atoms && Array.isArray(input.atoms) ? input.atoms : null);
  if (atomList) {
    const ids = [];
    for (const a of atomList) {
      const res = harvestSingle(db, {
        input: a,
        project: a.project || project,
        tags: a.tags || tags,
        trust_level: a.trust_level || trust_level,
        evidence: a.evidence || evidence
      });
      ids.push(res.id);
    }
    return {
      success: true,
      count: ids.length,
      ids,
      message: `Batch harvested ${ids.length} atoms successfully into Z-Brain SQLite.`
    };
  }

  return harvestSingle(db, { input, project, tags, trust_level, evidence });
}

function harvestSingle(db, { input, project, tags, trust_level, evidence }) {
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
    gotchaFix = input.gotcha_fix || (input.cause && input.fix ? `${input.cause} | ${input.fix}` : null);
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

  const normProject = (project || 'global').toLowerCase();

  // Smart Deduplication check
  const existing = findSimilarAtom(db, question, normProject);
  if (existing) {
    updateAtom(db, existing.id, {
      trust_level,
      gotcha_fix: gotchaFix,
      tags: tagList,
      evidence: evidenceList
    });
    return {
      success: true,
      id: existing.id,
      deduplicated: true,
      project: normProject,
      trust_level: (trust_level === 'verified_fact' || existing.trust_level === 'verified_fact') ? 'verified_fact' : (trust_level || existing.trust_level),
      tags: tagList,
      message: `Updated existing atom #${existing.id} with new evidence and tags (deduplicated).`
    };
  }

  const atom = {
    project_id: normProject,
    scope: normProject === 'global' ? 'global' : 'project',
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
