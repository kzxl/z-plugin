import { getDb, getAtomById, insertAtom, transact } from './db.mjs';
import { extractConcepts, queryTerms, calculateSemanticSimilarity, normalizeText } from './search.mjs';

function parseJsonArray(val) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function jaccardSet(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let inter = 0;
  for (const item of setA) {
    if (setB.has(item)) inter++;
  }
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
}

function weightedConceptJaccard(mapA, mapB) {
  if (mapA.size === 0 || mapB.size === 0) return 0;
  let minSum = 0;
  let maxSum = 0;
  const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
  for (const k of allKeys) {
    const a = mapA.get(k) || 0;
    const b = mapB.get(k) || 0;
    minSum += Math.min(a, b);
    maxSum += Math.max(a, b);
  }
  return maxSum > 0 ? minSum / maxSum : 0;
}

function prepareAtomFeatures(row) {
  const tags = parseJsonArray(row.tags);
  const meaningfulTags = new Set(
    tags
      .map(t => String(t).trim().toLowerCase())
      .filter(t => t && !t.startsWith('project:') && t !== 'auto_harvest' && t !== 'canonical_block')
  );
  const textForConcepts = `${row.question || ''} ${row.gotcha_fix || ''} ${row.answer || ''} ${[...meaningfulTags].join(' ')}`;
  const textForTokens = `${row.question || ''} ${row.gotcha_fix || ''} ${row.answer || ''}`;
  return {
    row,
    tags,
    evidence: parseJsonArray(row.evidence),
    files_touched: parseJsonArray(row.files_touched),
    meaningfulTags,
    concepts: extractConcepts(textForConcepts),
    tokens: new Set(queryTerms(textForTokens)),
    qText: `${row.question || ''} ${row.gotcha_fix || ''}`.trim()
  };
}

/**
 * Compute normalized similarity (0..1) between two prepared or raw atoms
 * combining concept alignment, shared tags, and token/trigram similarity.
 */
export function computeAtomSimilarity(atomA, atomB) {
  const fA = atomA.concepts ? atomA : prepareAtomFeatures(atomA);
  const fB = atomB.concepts ? atomB : prepareAtomFeatures(atomB);

  const hasConcepts = fA.concepts.size > 0 && fB.concepts.size > 0;
  const hasTags = fA.meaningfulTags.size > 0 && fB.meaningfulTags.size > 0;

  const conceptSim = hasConcepts ? weightedConceptJaccard(fA.concepts, fB.concepts) : 0;
  const tagSim = hasTags ? jaccardSet(fA.meaningfulTags, fB.meaningfulTags) : 0;
  const tokenSim = jaccardSet(fA.tokens, fB.tokens);
  const trigramSim = calculateSemanticSimilarity(fA.qText, fB.qText);
  const lexicalSim = Math.max(tokenSim, trigramSim);

  let totalWeight = 0.30;
  let score = 0.30 * lexicalSim;

  if (hasConcepts) {
    totalWeight += 0.45;
    score += 0.45 * conceptSim;
  }
  if (hasTags) {
    totalWeight += 0.25;
    score += 0.25 * tagSim;
  }

  return totalWeight > 0 ? score / totalWeight : 0;
}

/**
 * Mark an older atom as superseded by a newer atom, optionally recording a reason.
 */
export function supersedeAtom(db, oldAtomId, newAtomId, reason = null) {
  const targetDb = db || getDb();
  const oldId = Number(oldAtomId);
  const newId = Number(newAtomId);

  if (!Number.isInteger(oldId) || oldId <= 0 || !Number.isInteger(newId) || newId <= 0) {
    throw new Error('Valid positive integer oldAtomId and newAtomId are required.');
  }
  if (oldId === newId) {
    throw new Error('oldAtomId and newAtomId cannot be the same atom.');
  }

  const oldAtom = getAtomById(targetDb, oldId);
  if (!oldAtom) throw new Error(`Atom #${oldId} not found.`);
  const newAtom = getAtomById(targetDb, newId);
  if (!newAtom) throw new Error(`Atom #${newId} not found.`);

  const now = new Date().toISOString();
  const cleanReason = reason ? String(reason).trim() : null;

  transact(targetDb, () => {
    if (cleanReason) {
      const updatedEvidence = [...new Set([
        ...(oldAtom.evidence || []),
        `superseded_by:#${newId}:${cleanReason}`
      ])];
      targetDb.prepare(`
        UPDATE knowledge_atoms
        SET valid_to = ?, superseded_by = ?, evidence = ?, updated_at = ?
        WHERE id = ?
      `).run(now, newId, JSON.stringify(updatedEvidence), now, oldId);
    } else {
      targetDb.prepare(`
        UPDATE knowledge_atoms
        SET valid_to = ?, superseded_by = ?, updated_at = ?
        WHERE id = ?
      `).run(now, newId, now, oldId);
    }
  });

  return {
    success: true,
    oldAtomId: oldId,
    newAtomId: newId,
    reason: cleanReason,
    valid_to: now
  };
}

function buildCanonicalAtom(clusterFeatures, projectId) {
  // Prefer verified_fact or highest-confidence atom as representative title
  const sorted = [...clusterFeatures].sort((a, b) => {
    const aVer = a.row.trust_level === 'verified_fact' ? 1 : 0;
    const bVer = b.row.trust_level === 'verified_fact' ? 1 : 0;
    if (aVer !== bVer) return bVer - aVer;
    return (b.row.confidence || 0) - (a.row.confidence || 0) || a.row.id - b.row.id;
  });

  const rep = sorted[0].row;
  const sourceIds = clusterFeatures.map(f => f.row.id).sort((a, b) => a - b);

  // Deduplicate questions/fixes for canonical synthesis
  const seenNorm = new Set();
  const uniqueEntries = [];
  const uniqueFixes = [];

  for (const item of sorted) {
    const qNorm = normalizeText(item.row.question);
    if (!seenNorm.has(qNorm)) {
      seenNorm.add(qNorm);
      uniqueEntries.push({
        id: item.row.id,
        question: item.row.question,
        gotcha_fix: item.row.gotcha_fix || item.row.answer
      });
    }
    const fixText = String(item.row.gotcha_fix || '').trim();
    if (fixText && !uniqueFixes.some(f => normalizeText(f) === normalizeText(fixText))) {
      uniqueFixes.push(fixText);
    }
  }

  const mergedTags = [...new Set([
    ...clusterFeatures.flatMap(f => f.tags),
    'canonical_block',
    `project:${projectId}`
  ])];

  const mergedEvidence = [...new Set([
    ...clusterFeatures.flatMap(f => f.evidence),
    `compacted_from:${sourceIds.join(',')}`
  ])];

  const mergedFiles = [...new Set(clusterFeatures.flatMap(f => f.files_touched))];

  const canonicalQuestion = `[Canonical] ${rep.question}`;
  const canonicalGotchaFix = uniqueFixes.length > 0
    ? uniqueFixes.slice(0, 2).join(' ; ')
    : String(rep.gotcha_fix || rep.answer || '').slice(0, 200);

  const answerLines = [
    `Consolidated canonical knowledge block from ${clusterFeatures.length} atoms (#${sourceIds.join(', #')}):`,
    '',
    ...uniqueEntries.map(e => `- [#${e.id}] ${e.question} -> ${String(e.gotcha_fix || '').replace(/\s+/g, ' ').trim()}`)
  ];

  const maxConfidence = Math.max(
    0.95,
    ...clusterFeatures.map(f => Number(f.row.confidence || 0.5))
  );

  return {
    project_id: projectId,
    scope: projectId === 'global' ? 'global' : 'project',
    trust_level: 'verified_fact',
    question: canonicalQuestion,
    answer: answerLines.join('\n'),
    gotcha_fix: canonicalGotchaFix,
    tags: mergedTags,
    evidence: mergedEvidence,
    files_touched: mergedFiles,
    category: 'canonical_block',
    confidence: Math.min(1.0, maxConfidence),
    pinned: 1
  };
}

function clusterProjectAtoms(features, minClusterSize, similarityThreshold) {
  const n = features.length;
  if (n < minClusterSize) return [];

  const simMatrix = Array.from({ length: n }, () => new Float64Array(n));
  const neighborLists = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    simMatrix[i][i] = 1.0;
    for (let j = i + 1; j < n; j++) {
      const sim = computeAtomSimilarity(features[i], features[j]);
      simMatrix[i][j] = sim;
      simMatrix[j][i] = sim;
      if (sim >= similarityThreshold) {
        neighborLists[i].push({ idx: j, sim });
        neighborLists[j].push({ idx: i, sim });
      }
    }
  }

  for (const list of neighborLists) {
    list.sort((a, b) => b.sim - a.sim || a.idx - b.idx);
  }

  const assigned = new Uint8Array(n);
  const clusters = [];

  // Process seeds with highest neighbor degree first
  const order = Array.from({ length: n }, (_, i) => i)
    .sort((a, b) => neighborLists[b].length - neighborLists[a].length || a - b);

  for (const seed of order) {
    if (assigned[seed]) continue;
    if (neighborLists[seed].length + 1 < minClusterSize) continue;

    const members = [seed];
    for (const cand of neighborLists[seed]) {
      if (assigned[cand.idx]) continue;

      let sumSim = 0;
      let minSim = 1;
      for (const m of members) {
        const s = simMatrix[cand.idx][m];
        sumSim += s;
        if (s < minSim) minSim = s;
      }
      const avgSim = sumSim / members.length;
      if (avgSim >= similarityThreshold && minSim >= similarityThreshold * 0.7) {
        members.push(cand.idx);
      }
    }

    if (members.length >= minClusterSize) {
      let pairSum = 0;
      let pairCount = 0;
      for (let i = 0; i < members.length; i++) {
        assigned[members[i]] = 1;
        for (let j = i + 1; j < members.length; j++) {
          pairSum += simMatrix[members[i]][members[j]];
          pairCount++;
        }
      }
      clusters.push({
        items: members.map(idx => features[idx]),
        avgSimilarity: pairCount > 0 ? Number((pairSum / pairCount).toFixed(3)) : 1
      });
    }
  }

  return clusters;
}

/**
 * Cluster active atoms sharing a project and high concept/tag/token similarity (>= 0.45),
 * synthesize consolidated canonical `verified_fact` atoms (`category: 'canonical_block'`),
 * and mark source atoms with `superseded_by = canonicalId` and `compacted_into = canonicalId`.
 */
export function compactKnowledge({
  db: customDb = null,
  project = null,
  minClusterSize = 3,
  dryRun = false,
  similarityThreshold = 0.45
} = {}) {
  const db = customDb || getDb();
  const normProject = project && project !== 'all' ? String(project).trim().toLowerCase() : null;
  const clusterFloor = Math.max(2, Number(minClusterSize) || 3);

  let sql = `
    SELECT * FROM knowledge_atoms
    WHERE superseded_by IS NULL
      AND compacted_into IS NULL
      AND (category IS NULL OR category != 'canonical_block')
  `;
  const params = [];
  if (normProject) {
    sql += ' AND project_id = ?';
    params.push(normProject);
  }
  sql += ' ORDER BY id ASC';

  const activeRows = db.prepare(sql).all(...params);
  const byProject = new Map();
  for (const row of activeRows) {
    const pid = (row.project_id || 'global').toLowerCase();
    if (!byProject.has(pid)) byProject.set(pid, []);
    byProject.get(pid).push(prepareAtomFeatures(row));
  }

  const results = [];
  let atomsCompacted = 0;
  let canonicalCreated = 0;

  for (const [pid, features] of byProject) {
    const clusters = clusterProjectAtoms(features, clusterFloor, similarityThreshold);
    for (const cluster of clusters) {
      const canonicalAtom = buildCanonicalAtom(cluster.items, pid);
      const sourceIds = cluster.items.map(f => f.row.id).sort((a, b) => a - b);
      let canonicalId = null;

      if (!dryRun) {
        const now = new Date().toISOString();
        canonicalId = transact(db, () => {
          const newId = insertAtom(db, canonicalAtom);
          const updateStmt = db.prepare(`
            UPDATE knowledge_atoms
            SET superseded_by = ?,
                compacted_into = ?,
                valid_to = COALESCE(valid_to, ?),
                updated_at = ?
            WHERE id = ?
          `);
          for (const srcId of sourceIds) {
            updateStmt.run(newId, newId, now, now, srcId);
          }
          return newId;
        });
        canonicalCreated++;
      }

      atomsCompacted += sourceIds.length;
      results.push({
        project_id: pid,
        canonicalId,
        canonicalQuestion: canonicalAtom.question,
        sourceIds,
        avgSimilarity: cluster.avgSimilarity,
        tags: canonicalAtom.tags
      });
    }
  }

  return {
    dryRun: Boolean(dryRun),
    project: normProject || 'all',
    minClusterSize: clusterFloor,
    similarityThreshold,
    scannedAtoms: activeRows.length,
    clustersFound: results.length,
    atomsCompacted,
    canonicalCreated,
    clusters: results
  };
}
