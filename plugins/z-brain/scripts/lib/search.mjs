import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SYNONYMS_PATH = path.resolve(__dirname, '..', '..', 'data', 'synonyms.json');

let _cachedSynonyms = null;

export function reloadSynonymsDictionary(customPath = null) {
  _cachedSynonyms = null;
  return getSynonymsDictionary(customPath);
}

export function getSynonymsDictionary(customPath = null) {
  if (_cachedSynonyms && !customPath) return _cachedSynonyms;
  const dictPath = customPath || process.env.ZBRAIN_SYNONYMS_PATH || DEFAULT_SYNONYMS_PATH;
  let dict = {
    "ton kho": ["inventory", "stock", "ton_kho", "lot"],
    "tồn kho": ["inventory", "stock", "ton_kho", "lot"],
    "inventory": ["stock", "ton_kho", "lot", "tồn kho"],
    "deadlock": ["result", "sync-over-async", "configureawait", "wait"],
    "don hang": ["order", "don_hang", "sales"],
    "đơn hàng": ["order", "don_hang", "sales"],
    "phieu nhap": ["goods_receipt", "purchase_order", "phieu_nhap"],
    "phiếu nhập": ["goods_receipt", "purchase_order", "phieu_nhap"]
  };
  try {
    if (fs.existsSync(dictPath)) {
      dict = JSON.parse(fs.readFileSync(dictPath, 'utf8'));
    }
  } catch {}

  // Auto-merge contributed synonyms from installed DLC extensions
  if (!customPath) {
    const extDir = path.resolve(__dirname, '..', '..', '..', '..', 'extensions');
    if (fs.existsSync(extDir)) {
      try {
        const entries = fs.readdirSync(extDir, { withFileTypes: true });
        for (const ent of entries) {
          if (ent.isDirectory() && ent.name.startsWith('dlc-')) {
            const manifestPath = path.join(extDir, ent.name, 'z-plugin.manifest.json');
            if (fs.existsSync(manifestPath)) {
              try {
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                if (manifest.contributions?.synonyms) {
                  const synFile = path.resolve(extDir, ent.name, manifest.contributions.synonyms);
                  if (fs.existsSync(synFile)) {
                    const extSyns = JSON.parse(fs.readFileSync(synFile, 'utf8'));
                    Object.assign(dict, extSyns);
                  }
                }
              } catch {}
            }
          }
        }
      } catch {}
    }
  }

  _cachedSynonyms = dict;
  return _cachedSynonyms;
}

export function detectCurrentProject(cwd = process.cwd()) {
  try {
    const base = path.basename(cwd).toLowerCase().replace(/[^a-z0-9_\-]/g, '_');
    if (base && !['repos', 'source', 'desktop', 'documents', 'c', 'e'].includes(base)) {
      if (base.includes('erp')) return 'erp';
      if (base.includes('zero_universe') || base.includes('zerouniverse')) return 'zero_universe';
      if (base.includes('z-plugin') || base.includes('zplugin')) return 'z-plugin';
      return base;
    }
  } catch {}
  return 'global';
}

/**
 * Clean search query into safe FTS5 terms
 */
export function sanitizeFtsQuery(rawQuery, customSynonyms = null) {
  if (!rawQuery) return "";
  // Normalize developer keywords and compound words
  let normalized = rawQuery
    .replace(/c#/gi, " csharp ")
    .replace(/c\+\+/gi, " cpp ")
    .replace(/f#/gi, " fsharp ")
    .replace(/\.net/gi, " dotnet ")
    .replace(/(\w+)-(\w+)/g, "$1$2 $1 $2");

  const tagMatches = normalized.match(/(?:tag:(\w+)|#(\w+))/gi) || [];
  const extractedTags = tagMatches.map(t => t.replace(/^(tag:|#)/i, "").toLowerCase());

  const clean = normalized
    .replace(/(?:tag:\w+|#\w+)/gi, " ")
    .replace(/["'*():^{}\[\]\\\/]/g, " ")
    .trim();

  const words = clean
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !/^(the|and|for|with|from|this|that|trong|cho|cua|la|cac)$/i.test(w));

  const lowerRaw = rawQuery.toLowerCase();
  const synonyms = [];
  const dict = customSynonyms || getSynonymsDictionary();
  for (const [key, synList] of Object.entries(dict)) {
    if (lowerRaw.includes(key)) {
      synonyms.push(...synList);
    }
  }

  const allTerms = [...new Set([...words, ...extractedTags, ...synonyms])];
  if (allTerms.length === 0) return "";

  return allTerms.map(w => `"${w}"*`).join(" OR ");
}

export function calculateSemanticSimilarity(textA, textB) {
  if (!textA || !textB) return 0;
  const strA = String(textA).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const strB = String(textB).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (strA.includes(strB) || strB.includes(strA)) return 0.85;

  const getTrigrams = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
    return set;
  };
  const setA = getTrigrams(strA);
  const setB = getTrigrams(strB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let matches = 0;
  for (const t of setA) if (setB.has(t)) matches++;
  return (2 * matches) / (setA.size + setB.size);
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
  trustThreshold = null,
  synonyms = null
}) {
  const db = getDb();
  const ftsQuery = sanitizeFtsQuery(query, synonyms);
  const effectiveProject = project || detectCurrentProject();
  const normalizedProject = effectiveProject && effectiveProject !== "global" ? String(effectiveProject).trim().toLowerCase() : null;

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
    const searchTags = (Array.isArray(tags) ? tags : String(tags || "").split(",")).map(t => String(t).trim().toLowerCase()).filter(Boolean);
    if (searchTags.length > 0) {
      const rowTags = typeof row.tags === 'string' ? JSON.parse(row.tags || '[]') : (row.tags || []);
      const matched = searchTags.filter(t => rowTags.map(x => String(x).toLowerCase()).includes(t)).length;
      score += matched * 10;
    }

    // Semantic trigram similarity boost (up to +30 points)
    const semanticSim = calculateSemanticSimilarity(query, `${row.question} ${row.gotcha_fix || ''}`);
    score += semanticSim * 30;

    // Temporal recency boost (<30 days = +5 points)
    if (row.created_at) {
      try {
        const daysOld = (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysOld < 30) score += 5;
      } catch {}
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
