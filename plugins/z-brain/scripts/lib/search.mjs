import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './db.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SYNONYMS_PATH = path.resolve(__dirname, '..', '..', 'data', 'synonyms.json');

let _cachedSynonyms = null;

// Per-DB semantic index cache (invalidated when active atom count or max id/updated_at changes)
const _semanticIndexCache = new WeakMap();

const QUERY_STOPWORDS = /^(the|and|for|with|from|this|that|when|what|how|why|into|onto|after|before|during|without|while|khi|trong|cho|cua|la|cac|nhung|voi|thi|bi|duoc|mot|va|hoac|nhu|de|se|da|dang|nay|do|ra|vao|len|xuong|ma|nhung|van|bi|theo|lai|khac)$/;

export function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[đð]/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * General-purpose bilingual (EN <-> VI) software engineering concept lexicon.
 * Each entry maps a canonical engineering concept to normalized surface phrases
 * across English and Vietnamese so paraphrase and cross-lingual queries align
 * with stored atoms without external embedding models.
 */
const RAW_CONCEPT_LEXICON = [
  {
    id: 'concurrency_lock',
    weight: 1.2,
    terms: [
      'concurrency', 'concurrent', 'lock', 'locked', 'locking', 'contention', 'mutex', 'semaphore',
      'thread', 'threads', 'multithread', 'race condition', 'parallel', 'simultaneous',
      'luong', 'da luong', 'dong thoi', 'cung luc', 'khoa', 'bi khoa', 'tranh chap'
    ]
  },
  {
    id: 'multi_actor_write',
    weight: 1.4,
    terms: [
      'two agents', 'two processes', 'two sessions', 'two observers',
      'two agents write', 'two processes write', 'hai luong', 'hai luong ghi'
    ]
  },
  {
    id: 'concurrent_write',
    weight: 1.3,
    terms: [
      'concurrent harvest writes', 'write lock', 'writes', 'write',
      'ghi', 'luong ghi', 'cung ghi', 'khoa ghi', 'ghi dong thoi'
    ]
  },
  {
    id: 'sqlite_wal',
    weight: 1.4,
    terms: [
      'sqlite', 'wal', 'sqlite busy', 'busy timeout', 'database is locked', 'litesql'
    ]
  },
  {
    id: 'deadlock',
    weight: 1.4,
    terms: [
      'deadlock', 'dead lock', 'sync over async', 'configureawait', 'updlock', 'reverse order',
      'khoa cheo', 'be tac', 'treo luong'
    ]
  },
  {
    id: 'distributed_lock',
    weight: 1.35,
    terms: [
      'redis', 'distributed lock', 'owner token', 'ownership token', 'lua script', 'another node',
      'khoa phan tan'
    ]
  },
  {
    id: 'sql_query',
    weight: 1.15,
    terms: [
      'sql', 'raw sql', 'query', 'statement', 'predicate', 'filter', 'global query filter',
      'truy van', 'cau lenh sql', 'sql tay', 'viet sql', 'bo loc', 'loc du lieu'
    ]
  },
  {
    id: 'multitenant',
    weight: 1.5,
    terms: [
      'tenant', 'tenants', 'multitenant', 'multi tenant', 'tenant filter', 'tenant predicate',
      'company', 'cong ty', 'theo cong ty', 'bo qua', 'missing', 'da thue bao', 'chi nhanh'
    ]
  },
  {
    id: 'db_orm_index',
    weight: 1.25,
    terms: [
      'index', 'composite index', 'ef core', 'efcore', 'lazy loading', 'asnotracking', 'change tracker',
      'n 1', 'stale entity', 'chi muc', 'truy van cham'
    ]
  },
  {
    id: 'db_save_persist',
    weight: 1.0,
    terms: [
      'save', 'saving', 'savechanges', 'commit', 'transaction', 'luu', 'giao dich'
    ]
  },
  {
    id: 'audit_trigger',
    weight: 1.3,
    terms: [
      'audit', 'audit log', 'audit trail', 'trigger', 'delete trigger', 'nhat ky', 'theo doi'
    ]
  },
  {
    id: 'schema_version',
    weight: 1.35,
    terms: [
      'schema', 'user version', 'pragma', 'downgrade', 'migration', 'newer database', 'luoc do'
    ]
  },
  {
    id: 'ui_freeze',
    weight: 1.4,
    terms: [
      'ui', 'freeze', 'freezes', 'frozen', 'hang', 'lag', 'unresponsive', 'wpf', 'winforms',
      'giao dien', 'bi treo', 'treo', 'treo giao dien', 'do giao dien', 'dung hinh'
    ]
  },
  {
    id: 'list_virtualization',
    weight: 1.4,
    terms: [
      'virtualization', 'virtualizingstackpanel', 'observablecollection', 'large collection',
      'long list', 'collection', 'danh sach', 'danh sach dai', 'hien thi', 'hien thi danh sach', 'bang lon'
    ]
  },
  {
    id: 'grid_selection',
    weight: 1.35,
    terms: [
      'devexpress', 'grid', 'beginupdate', 'endupdate', 'selection', 'refresh', 'mat chon', 'lam moi'
    ]
  },
  {
    id: 'dpi_scaling',
    weight: 1.35,
    terms: [
      'dpi', 'scaling', 'autoscalemode', '150', 'ti le man hinh'
    ]
  },
  {
    id: 'money_amount',
    weight: 1.25,
    terms: [
      'money', 'currency', 'amount', 'total', 'order total', 'price', 'decimal', 'float', 'precision',
      'tien', 'tong tien', 'so tien', 'gia tri', 'mot dong', '1 dong', '1 xu'
    ]
  },
  {
    id: 'rounding_mismatch',
    weight: 1.35,
    terms: [
      'rounding', 'round', 'rounded', 'midpointrounding', 'differs', 'mismatch', '0 01', 'discount', 'vat', 'tax',
      'lam tron', 'sai so', 'lech', 'bi lech', 'chenh lech', 'thue', 'chiet khau'
    ]
  },
  {
    id: 'order_entity',
    weight: 1.1,
    terms: [
      'order', 'orders', 'cancelorder', 'don hang', 'don'
    ]
  },
  {
    id: 'order_cancel',
    weight: 1.4,
    terms: [
      'cancel', 'cancelled', 'canceled', 'cancellation', 'cancelorder',
      'huy', 'huy don', 'huy don hang'
    ]
  },
  {
    id: 'inventory_stock',
    weight: 1.15,
    terms: [
      'inventory', 'stock', 'on hand', 'negative', 'lot',
      'ton kho', 'hang trong kho', 'hang hoa', 'hang', 'kho', 'am kho', 'so luong'
    ]
  },
  {
    id: 'stock_reservation',
    weight: 1.45,
    terms: [
      'reservation', 'reserve', 'reserved', 'release', 'locked', 'hold',
      'giu cho', 'giu hang', 'bi giu', 'dat cho', 'tam giu', 'giai phong'
    ]
  },
  {
    id: 'barcode_scanner',
    weight: 1.5,
    terms: [
      'barcode', 'scanner', 'scan', 'debounce', 'double enters', 'double', 'twice', 'trailing enter',
      'ma vach', 'quet ma vach', 'quet', 'hai lan', '2 lan', 'nhap dup', 'bi tru hai lan', 'tru hai lan'
    ]
  },
  {
    id: 'goods_receipt',
    weight: 1.35,
    terms: [
      'goods receipt', 'receipt', 'phieu nhap', 'nhap kho', 'duyet phieu'
    ]
  },
  {
    id: 'warehouse_ledger',
    weight: 1.3,
    terms: [
      'warehouse', 'transfer', 'ledger', 'sync', 'debit', 'credit',
      'chuyen kho', 'so cai', 'dong bo'
    ]
  },
  {
    id: 'memory_atom',
    weight: 1.25,
    terms: [
      'memory', 'atom', 'atoms', 'knowledge', 'brain', 'harvest', 'ingest',
      'ky uc', 'tri nho', 'nap lai', 'thu thap', 'luu tru'
    ]
  },
  {
    id: 'deduplication',
    weight: 1.45,
    terms: [
      'dedupe', 'dedup', 'deduplicate', 'duplicate', 'duplicates', 'reworded', 'reword', 'paraphrase',
      'similarity', 'prefix', 'idempotent',
      'trung lap', 'trung', 'lap lai', 'dien dat khac', 'noi dung khac', 'noi dung dien dat khac'
    ]
  },
  {
    id: 'leader_lease',
    weight: 1.45,
    terms: [
      'leader', 'leadership', 'lease', 'ttl', 'pid', 'observer', 'observers',
      'lanh dao', 'quyen ghi', 'gia han'
    ]
  },
  {
    id: 'process_crash',
    weight: 1.35,
    terms: [
      'crash', 'crashes', 'dies', 'died', 'die', 'killed', 'process', 'processes', 'lost', 'spool', 'replay',
      'tien trinh', 'tien trinh chet', 'chet', 'sap', 'bi mat', 'mat'
    ]
  },
  {
    id: 'project_identity',
    weight: 1.3,
    terms: [
      'project id', 'git remote', 'clone', 'cloned', 'registry', 'reconcile', 'untracked', 'git ls files'
    ]
  },
  {
    id: 'auth_jwt',
    weight: 1.4,
    terms: [
      'auth', 'jwt', 'token', 'refresh token', 'expires', 'expiry', 'expired',
      'het han', 'xac thuc', 'dang nhap'
    ]
  },
  {
    id: 'permissions_rbac',
    weight: 1.35,
    terms: [
      'permission', 'permissions', 'role', 'roles', 'rbac', 'quyen', 'phan quyen', 'vai tro'
    ]
  },
  {
    id: 'cache_invalidation',
    weight: 1.4,
    terms: [
      'cache', 'invalidation', 'invalidate', 'invalidated', 'stale', 'cache key', 'role version',
      'bo nho dem', 'lam moi cache'
    ]
  },
  {
    id: 'pdf_font_i18n',
    weight: 1.4,
    terms: [
      'pdf', 'font', 'glyph', 'unicode', 'vietnamese', 'tieng viet', 'i18n', 'print', 'printing', 'printer',
      'xuat pdf', 'loi font', 'a5', 'a4', 'footer', 'margins', 'in an'
    ]
  },
  {
    id: 'build_compiler',
    weight: 1.3,
    terms: [
      'msbuild', 'cs0246', 'nu1603', 'nuget', 'package', 'downgrade', 'iprinter', 'build', 'coded errors'
    ]
  },
  {
    id: 'excel_import',
    weight: 1.3,
    terms: [
      'excel', 'merged cells', 'import', 'forward fill', 'o gop'
    ]
  },
  {
    id: 'agent_tooling',
    weight: 1.25,
    terms: [
      'outline', 'multiline', 'grep', 'guard', 'loop breaker', 'anti slop', 'slop', 'tsx', 'tailwind',
      'canvas', 'qoder', 'antigravity', 'toolcall', 'tool input', 'tool name', 'hook', 'mcp', 'fts5', 'hyphen'
    ]
  }
];

const CONCEPT_LEXICON = RAW_CONCEPT_LEXICON.map((c) => ({
  id: c.id,
  weight: c.weight,
  terms: [...new Set(c.terms.map(normalizeText).filter(Boolean))]
}));

/**
 * Extract normalized engineering concepts present in text.
 * Uses padded word-boundary substring checks (` ${term} `) for zero-regex speed and precision.
 */
export function extractConcepts(text) {
  const norm = normalizeText(text);
  const matched = new Map();
  if (!norm) return matched;
  const padded = ` ${norm} `;

  for (const concept of CONCEPT_LEXICON) {
    let hitCount = 0;
    for (const term of concept.terms) {
      if (padded.includes(` ${term} `)) {
        hitCount++;
      }
    }
    if (hitCount > 0) {
      // Slight diminishing boost when multiple surface phrases from the same concept match
      const score = concept.weight * (1 + Math.min(hitCount - 1, 2) * 0.15);
      matched.set(concept.id, score);
    }
  }
  return matched;
}

function conceptSimilarity(conceptsA, conceptsB) {
  if (conceptsA.size === 0 || conceptsB.size === 0) {
    return { recall: 0, cosine: 0, matchedCount: 0 };
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  let matchedWeight = 0;
  let totalWeightA = 0;
  let matchedCount = 0;

  for (const [id, wA] of conceptsA) {
    totalWeightA += wA;
    normA += wA * wA;
    const wB = conceptsB.get(id);
    if (wB !== undefined) {
      dot += wA * wB;
      matchedWeight += wA;
      matchedCount++;
    }
  }
  for (const wB of conceptsB.values()) {
    normB += wB * wB;
  }

  const recall = totalWeightA > 0 ? matchedWeight / totalWeightA : 0;
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  const cosine = denom > 0 ? dot / denom : 0;
  return { recall, cosine, matchedCount };
}

function extractTrigramsAndTokens(normText) {
  const counts = new Map();
  if (!normText) return counts;

  const words = normText.split(' ');
  for (const w of words) {
    if (w.length >= 2 && !QUERY_STOPWORDS.test(w)) {
      const tokKey = `w:${w}`;
      counts.set(tokKey, (counts.get(tokKey) || 0) + 2.0);
    }
    if (w.length >= 3) {
      const paddedWord = `^${w}$`;
      for (let i = 0; i <= paddedWord.length - 3; i++) {
        const tri = paddedWord.slice(i, i + 3);
        counts.set(tri, (counts.get(tri) || 0) + 1.0);
      }
    }
  }
  return counts;
}

function buildTfIdfVector(rawCounts, idfMap, defaultIdf) {
  const vec = new Map();
  let sqNorm = 0;
  for (const [feat, tf] of rawCounts) {
    const idf = idfMap.get(feat) ?? defaultIdf;
    const weight = (1 + Math.log(tf)) * idf;
    vec.set(feat, weight);
    sqNorm += weight * weight;
  }
  return { vec, norm: Math.sqrt(sqNorm) };
}

function cosineSparse(vecA, normA, vecB, normB) {
  if (normA === 0 || normB === 0) return 0;
  let dot = 0;
  const [smaller, larger] = vecA.size <= vecB.size ? [vecA, vecB] : [vecB, vecA];
  for (const [k, v] of smaller) {
    const other = larger.get(k);
    if (other !== undefined) dot += v * other;
  }
  return dot / (normA * normB);
}

function getSemanticIndex(db, includeSuperseded = false) {
  const filterClause = includeSuperseded ? '' : 'WHERE superseded_by IS NULL';
  const sigRow = db.prepare(
    `SELECT count(*) AS c, COALESCE(max(id), 0) AS m, COALESCE(max(updated_at), '') AS u FROM knowledge_atoms ${filterClause}`
  ).get();
  const signature = `${includeSuperseded ? 'all' : 'active'}:${sigRow.c}:${sigRow.m}:${sigRow.u}`;

  let dbCache = _semanticIndexCache.get(db);
  if (dbCache && dbCache.signature === signature) {
    return dbCache;
  }

  // Cap semantic cache to 2000 highest-priority active atoms to guarantee sub-10ms latency even on huge DBs.
  const rows = db.prepare(`
    SELECT id, project_id, scope, trust_level, question, answer, gotcha_fix, tags, evidence, created_at, superseded_by
    FROM knowledge_atoms
    ${filterClause}
    ORDER BY pinned DESC, (trust_level = 'verified_fact') DESC, id DESC
    LIMIT 2000
  `).all();

  const df = new Map();
  const rawDocs = [];
  const conceptPostings = new Map();

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    let tagText = '';
    try {
      const parsed = typeof row.tags === 'string' ? JSON.parse(row.tags || '[]') : (row.tags || []);
      tagText = Array.isArray(parsed) ? parsed.join(' ') : String(parsed || '');
    } catch {}

    const fullText = `${row.question || ''} ${row.gotcha_fix || ''} ${row.answer || ''} ${tagText}`;
    const concepts = extractConcepts(fullText);
    for (const cid of concepts.keys()) {
      let list = conceptPostings.get(cid);
      if (!list) {
        list = [];
        conceptPostings.set(cid, list);
      }
      list.push(idx);
    }

    // Weight question + gotcha_fix higher in lexical/trigram representation
    const weightedNorm = `${normalizeText(row.question)} ${normalizeText(row.question)} ${normalizeText(row.gotcha_fix)} ${normalizeText(row.answer)} ${normalizeText(tagText)}`.trim();
    const rawCounts = extractTrigramsAndTokens(weightedNorm);
    for (const feat of rawCounts.keys()) {
      df.set(feat, (df.get(feat) || 0) + 1);
    }
    rawDocs.push({ row, concepts, rawCounts });
  }

  const N = Math.max(1, rows.length);
  const idfMap = new Map();
  for (const [feat, count] of df) {
    idfMap.set(feat, Math.log((N + 1) / (count + 1)) + 1);
  }
  const defaultIdf = Math.log(N + 1) + 1;

  const docs = rawDocs.map((d) => {
    const { vec, norm } = buildTfIdfVector(d.rawCounts, idfMap, defaultIdf);
    return {
      row: d.row,
      concepts: d.concepts,
      vec,
      norm
    };
  });

  dbCache = { signature, docs, idfMap, defaultIdf, conceptPostings };
  _semanticIndexCache.set(db, dbCache);
  return dbCache;
}

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
  if (!rawQuery) return '';
  let normalized = rawQuery
    .replace(/c#/gi, ' csharp ')
    .replace(/c\+\+/gi, ' cpp ')
    .replace(/f#/gi, ' fsharp ')
    .replace(/\.net/gi, ' dotnet ')
    .replace(/(\w+)-(\w+)/g, '$1$2 $1 $2');

  const tagMatches = normalized.match(/(?:tag:(\w+)|#(\w+))/gi) || [];
  const extractedTags = tagMatches.map(t => t.replace(/^(tag:|#)/i, '').toLowerCase());

  const clean = normalized
    .replace(/(?:tag:\w+|#\w+)/gi, ' ')
    .replace(/["'*():^{}\[\]\\\/]/g, ' ')
    .trim();

  const words = clean
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => {
      if (w.length <= 1) return false;
      const normW = normalizeText(w);
      return normW.length > 1 && !QUERY_STOPWORDS.test(normW);
    });

  const lowerRaw = rawQuery.toLowerCase();
  const normRaw = normalizeText(rawQuery);
  const synonyms = [];
  const dict = customSynonyms || getSynonymsDictionary();
  for (const [key, synList] of Object.entries(dict)) {
    const normKey = normalizeText(key);
    if (lowerRaw.includes(key) || (normKey && normRaw.includes(normKey))) {
      synonyms.push(...synList);
    }
  }

  const allTerms = [...new Set([...words, ...extractedTags, ...synonyms])];
  if (allTerms.length === 0) return '';

  return allTerms.map(w => `"${w}"*`).join(' OR ');
}

/**
 * Accent-insensitive query terms used for coverage and title bonuses.
 */
export function queryTerms(rawQuery) {
  return [...new Set(
    normalizeText(rawQuery)
      .split(' ')
      .filter((word) => word.length > 1 && !QUERY_STOPWORDS.test(word))
  )];
}

export function calculateSemanticSimilarity(textA, textB) {
  if (!textA || !textB) return 0;
  const strA = normalizeText(textA);
  const strB = normalizeText(textB);
  if (!strA || !strB) return 0;
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

function isRowInScope(row, normalizedProject, includeGlobal) {
  if (!normalizedProject) return true;
  if (includeGlobal) {
    return row.project_id === normalizedProject || row.scope === 'global' || row.project_id === 'global';
  }
  return row.project_id === normalizedProject;
}

/**
 * Three-tier hybrid search:
 * 1. FTS5 BM25 lexical + synonym match
 * 2. LIKE fallback for exact substrings
 * 3. Lightweight concept + char-trigram TF-IDF cosine semantic fallback when FTS5 yields < limit strong matches
 * Filters out superseded atoms (`superseded_by IS NULL`) by default unless `includeSuperseded: true`.
 */
export function searchKnowledge({
  query,
  project = null,
  tags = [],
  limit = 5,
  includeGlobal = true,
  trustThreshold = null,
  synonyms = null,
  includeSuperseded = false,
  db: customDb = null
}) {
  const db = customDb || getDb();
  const ftsQuery = sanitizeFtsQuery(query, synonyms);
  const effectiveProject = project || detectCurrentProject();
  const normalizedProject = effectiveProject && effectiveProject !== 'global'
    ? String(effectiveProject).trim().toLowerCase()
    : null;

  let results = [];
  const supersededSql = includeSuperseded ? '' : ' AND a.superseded_by IS NULL';
  const supersededPlainSql = includeSuperseded ? '' : ' AND superseded_by IS NULL';

  if (ftsQuery) {
    let sql = `
      SELECT
        a.id, a.project_id, a.scope, a.trust_level,
        a.question, a.answer, a.gotcha_fix, a.tags,
        a.evidence, a.created_at, a.superseded_by,
        bm25(knowledge_fts, 6.0, 1.0, 2.0, 0.4) as bm25_rank
      FROM knowledge_fts f
      JOIN knowledge_atoms a ON a.id = f.rowid
      WHERE knowledge_fts MATCH ?${supersededSql}
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
    params.push(limit * 3);

    try {
      results = db.prepare(sql).all(...params);
    } catch {
      results = [];
    }
  }

  const terms = queryTerms(query);
  const strongTerms = terms.filter((term) => term.length >= 3);
  const gateTerms = strongTerms.length >= 2 ? strongTerms : terms;
  const qConcepts = extractConcepts(query);

  const countStrongMatches = (rows) => {
    let strong = 0;
    for (const row of rows) {
      const hay = `${normalizeText(row.question)} ${normalizeText(row.answer)} ${normalizeText(row.gotcha_fix)}`;
      const matchedTerms = gateTerms.filter((t) => hay.includes(t)).length;
      const termRatio = gateTerms.length > 0 ? matchedTerms / gateTerms.length : 0;
      const bm25Strong = typeof row.bm25_rank === 'number' && Number.isFinite(row.bm25_rank) && -row.bm25_rank >= 3.0;
      if ((termRatio >= 0.5 && matchedTerms >= Math.min(2, gateTerms.length)) || (bm25Strong && termRatio >= 0.34)) {
        strong++;
      }
    }
    return strong;
  };

  const strongFtsCount = countStrongMatches(results);

  // 2. Fallback with LIKE query if FTS returned fewer than limit
  if (results.length < limit && query) {
    const rawWords = query.split(/\s+/).filter(w => w.length >= 3).slice(0, 3);
    if (rawWords.length > 0) {
      let likeSql = `
        SELECT
          id, project_id, scope, trust_level,
          question, answer, gotcha_fix, tags,
          evidence, created_at, superseded_by,
          NULL as bm25_rank
        FROM knowledge_atoms
        WHERE (${rawWords.map(() => `(question LIKE ? OR answer LIKE ?)`).join(' OR ')})${supersededPlainSql}
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

  // 3. Semantic fallback: Bilingual Concept + Character-Trigram TF-IDF cosine similarity
  const semanticCache = (strongFtsCount < limit && query) ? getSemanticIndex(db, includeSuperseded) : null;
  const queryNorm = normalizeText(query);
  const qRawCounts = semanticCache ? extractTrigramsAndTokens(queryNorm) : null;
  const qTfIdf = semanticCache ? buildTfIdfVector(qRawCounts, semanticCache.idfMap, semanticCache.defaultIdf) : null;

  if (semanticCache && query) {
    const existingIds = new Set(results.map(r => r.id));
    const candidateIndices = new Set();

    for (const cid of qConcepts.keys()) {
      const postings = semanticCache.conceptPostings.get(cid);
      if (postings) {
        for (const idx of postings) candidateIndices.add(idx);
      }
    }

    // If concept postings yielded too few candidates, include recent in-scope atoms for trigram TF-IDF recall
    if (candidateIndices.size < 30) {
      const maxScan = Math.min(semanticCache.docs.length, 250);
      for (let i = 0; i < maxScan; i++) {
        candidateIndices.add(i);
      }
    }

    const semanticCandidates = [];
    for (const idx of candidateIndices) {
      const doc = semanticCache.docs[idx];
      if (!isRowInScope(doc.row, normalizedProject, includeGlobal)) continue;

      const cSim = conceptSimilarity(qConcepts, doc.concepts);
      const tSim = cosineSparse(qTfIdf.vec, qTfIdf.norm, doc.vec, doc.norm);
      const combined = cSim.recall * 0.65 + cSim.cosine * 0.2 + tSim * 0.35;

      if (combined >= 0.08 || cSim.matchedCount > 0) {
        semanticCandidates.push({ doc, combined });
      }
    }

    semanticCandidates.sort((a, b) => b.combined - a.combined);
    for (const { doc } of semanticCandidates.slice(0, limit * 2)) {
      if (!existingIds.has(doc.row.id)) {
        results.push({ ...doc.row, bm25_rank: null });
        existingIds.add(doc.row.id);
      }
    }
  }

  // 4. Unified hybrid re-ranking
  const firstTerm = terms[0] || '';
  const searchTags = (Array.isArray(tags) ? tags : String(tags || '').split(','))
    .map(t => String(t).trim().toLowerCase())
    .filter(Boolean);

  // Build quick lookup for cached doc representations if semantic index was loaded
  const docById = new Map();
  if (semanticCache) {
    for (const d of semanticCache.docs) docById.set(d.row.id, d);
  }

  const scored = results.map(row => {
    let bm25Score = 0;
    if (typeof row.bm25_rank === 'number' && Number.isFinite(row.bm25_rank)) {
      bm25Score = Math.min(40, Math.max(0, -row.bm25_rank * 12));
    }

    let score = 0;

    if (row.trust_level === 'verified_fact') score += 5;
    else if (row.trust_level === 'observation') score += 2;

    if (normalizedProject && row.project_id === normalizedProject) score += 12;

    const parsedTags = typeof row.tags === 'string' ? JSON.parse(row.tags || '[]') : (row.tags || []);
    if (searchTags.length > 0) {
      const lowerRowTags = parsedTags.map(x => String(x).toLowerCase());
      const matched = searchTags.filter(t => lowerRowTags.includes(t)).length;
      score += Math.min(matched, 2) * 3;
    }

    const questionNorm = normalizeText(row.question);
    const haystack = `${questionNorm} ${normalizeText(row.answer)} ${normalizeText(row.gotcha_fix)}`;

    // Concept alignment score (bridges cross-lingual paraphrases and disambiguates near-duplicates)
    let matchedConceptCount = 0;
    if (qConcepts.size > 0) {
      const cachedDoc = docById.get(row.id);
      const atomConcepts = cachedDoc
        ? cachedDoc.concepts
        : extractConcepts(`${row.question || ''} ${row.gotcha_fix || ''} ${row.answer || ''} ${parsedTags.join(' ')}`);
      const cSim = conceptSimilarity(qConcepts, atomConcepts);
      matchedConceptCount = cSim.matchedCount;
      score += (cSim.recall * 0.85 + cSim.cosine * 0.15) * 42;
      if (qConcepts.size >= 2 && matchedConceptCount >= 2) {
        score += 10;
      }
    }

    let matchedTerms = 0;
    if (gateTerms.length > 0) {
      matchedTerms = gateTerms.filter(t => haystack.includes(t)).length;
      score += (matchedTerms / gateTerms.length) * 20;
      if (gateTerms.length >= 2 && matchedTerms < 2 && matchedConceptCount < 2) {
        score -= 10;
      }
    }

    // Dampen single-token FTS5 collisions on multi-term queries when concept alignment is also weak
    if (bm25Score > 0) {
      const isSingleTermCollision = gateTerms.length >= 2 && matchedTerms < 2 && matchedConceptCount < 2;
      score += isSingleTermCollision ? bm25Score * 0.45 : bm25Score;
    }

    if (queryNorm && questionNorm.startsWith(queryNorm)) score += 12;
    else if (firstTerm && questionNorm.split(' ')[0] === firstTerm) score += 6;

    if (semanticCache && qTfIdf) {
      const cachedDoc = docById.get(row.id);
      if (cachedDoc) {
        const tfidfWeight = bm25Score > 0 ? 10 : 24;
        score += cosineSparse(qTfIdf.vec, qTfIdf.norm, cachedDoc.vec, cachedDoc.norm) * tfidfWeight;
      }
    } else {
      const semanticSim = calculateSemanticSimilarity(query, `${row.question} ${row.gotcha_fix || ''}`);
      score += semanticSim * 5;
    }

    if (row.created_at) {
      try {
        const daysOld = (Date.now() - new Date(row.created_at).getTime()) / (1000 * 60 * 60 * 24);
        if (daysOld < 30) score += 1;
      } catch {}
    }

    return {
      ...row,
      score,
      tags: parsedTags,
      evidence: typeof row.evidence === 'string' ? JSON.parse(row.evidence || '[]') : row.evidence
    };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
