import { getDb } from './db.mjs';

/**
 * Clean search query into safe FTS5 terms
 */
function sanitizeFtsQuery(rawQuery) {
  if (!rawQuery) return '';
  // Remove special FTS punctuation
  const clean = rawQuery
    .replace(/["'*():^{}[\]\\/]/g, ' ')
    .trim();

  const words = clean
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !/^(the|and|for|with|from|this|that|trong|cho|cua|la|cac)$/i.test(w));

  if (words.length === 0) return '';

  // Match words with OR / prefix matching
  return words.map(w => `"${w}"*`).join(' OR ');
}

/**
 * Two-tier hybrid search with BM25 + Trust ranking + Scope filtering
 */
export function searchKnowledge({
  query,
  project = null,
  tags = [],
  limit = 5,
  includeGlobal = true,
  trustThreshold = null
}) {
  const db = getDb();
  const ftsQuery = sanitizeFtsQuery(query);
  const normalizedProject = project ? String(project).trim().toLowerCase() : null;

  let results = [];

  if (ftsQuery) {
    // 1. Search via FTS5 index
    let sql = `
      SELECT 
        a.id, a.project_id, a.scope, a.trust_level,
        a.question, a.answer, a.gotcha_fix, a.tags,
        a.evidence, a.created_at,
        f.rank as bm25_rank
      FROM knowledge_fts f
      JOIN knowledge_atoms a ON a.id = f.rowid
      WHERE knowledge_fts MATCH ?
    `;
    const params = [ftsQuery];

    if (normalizedProject) {
      if (includeGlobal) {
        sql += ` AND (a.project_id = ? OR a.scope = 'global' OR a.project_id = 'global')`;
        params.push(normalizedProject);
      } else {
        sql += ` AND a.project_id = ?`;
        params.push(normalizedProject);
      }
    }

    sql += ` ORDER BY bm25_rank ASC LIMIT ?`;
    params.push(limit * 2);

    try {
      results = db.prepare(sql).all(...params);
    } catch (err) {
      // Fallback to substring query if FTS match syntax fails
      results = [];
    }
  }

  // 2. Fallback or augment with LIKE query if FTS returns fewer than limit
  if (results.length < limit && query) {
    const rawWords = query.split(/\s+/).filter(w => w.length >= 3).slice(0, 3);
    if (rawWords.length > 0) {
      let likeSql = `
        SELECT 
          id, project_id, scope, trust_level,
          question, answer, gotcha_fix, tags,
          evidence, created_at,
          10.0 as bm25_rank
        FROM knowledge_atoms
        WHERE (${rawWords.map(() => `(question LIKE ? OR answer LIKE ?)`).join(' OR ')})
      `;
      const likeParams = [];
      rawWords.forEach(w => {
        likeParams.push(`%${w}%`, `%${w}%`);
      });

      if (normalizedProject) {
        if (includeGlobal) {
          likeSql += ` AND (project_id = ? OR scope = 'global' OR project_id = 'global')`;
          likeParams.push(normalizedProject);
        } else {
          likeSql += ` AND project_id = ?`;
          likeParams.push(normalizedProject);
        }
      }

      const existingIds = new Set(results.map(r => r.id));
      likeSql += ` LIMIT ?`;
      likeParams.push(limit * 2);

      const likeResults = db.prepare(likeSql).all(...likeParams);
      for (const row of likeResults) {
        if (!existingIds.has(row.id)) {
          results.push(row);
          existingIds.add(row.id);
        }
      }
    }
  }

  // 3. Re-score with Trust Level weight and tag matching
  const scored = results.map(row => {
    let score = 100 - (row.bm25_rank || 0);

    // Trust boost
    if (row.trust_level === 'verified_fact') score += 20;
    else if (row.trust_level === 'observation') score += 10;

    // Scope boost
    if (normalizedProject && row.project_id === normalizedProject) score += 15;

    // Tag boost
    if (tags && tags.length > 0) {
      const rowTags = typeof row.tags === 'string' ? JSON.parse(row.tags || '[]') : (row.tags || []);
      const matched = tags.filter(t => rowTags.includes(t)).length;
      score += matched * 10;
    }

    return {
      ...row,
      score,
      tags: typeof row.tags === 'string' ? JSON.parse(row.tags || '[]') : row.tags,
      evidence: typeof row.evidence === 'string' ? JSON.parse(row.evidence || '[]') : row.evidence
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
