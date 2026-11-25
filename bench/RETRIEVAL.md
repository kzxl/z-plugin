# z-brain retrieval quality

Generated 2026-11-25T14:56:08.707Z
Corpus: 50 atoms (30 erp, 20 global) | Labeled queries: 50 | k=5

## Lexical set (gated regression)

| System | Hit@1 | Hit@3 | Hit@5 | Recall@5 | P@5 | MRR | nDCG@5 | Miss | p50 | p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hybrid (production) | 100.0% | 100.0% | 100.0% | 100.0% | 22.1% | 1.000 | 1.000 | 0.0% | 0.82ms | 1.26ms |
| raw FTS5 | 100.0% | 100.0% | 100.0% | 100.0% | 34.8% | 1.000 | 0.997 | 0.0% | 0.38ms | 0.67ms |

Ranking lift of the re-rank layer over raw FTS5: hit@3 0.0pp, recall@5 0.0pp, MRR +0.000.

## Paraphrase set (cross-lingual / zero lexical overlap)

| System | Hit@1 | Hit@3 | Hit@5 | Recall@5 | P@5 | MRR | nDCG@5 | Miss | p50 | p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hybrid (production) | 62.5% | 100.0% | 100.0% | 100.0% | 20.6% | 0.813 | 0.862 | 0.0% | 1.05ms | 1.21ms |
| raw FTS5 | 0.0% | 25.0% | 25.0% | 25.0% | 5.0% | 0.083 | 0.125 | 75.0% | 0.34ms | 0.58ms |

These queries express the same problem without reusing the atom's words. Raw FTS5 struggles on them; the bilingual concept + character-trigram TF-IDF fallback closes the recall gap without external embeddings.

## Notes

- `hybrid (production)` = `searchKnowledge()`: FTS5 BM25 with field weights (question 6x), LIKE fallback, and a zero-dependency bilingual EN<->VI concept + character-trigram TF-IDF cosine semantic fallback when FTS5 returns fewer than `limit` strong matches.
- `raw FTS5` = same sanitized query, BM25 order only. The gap is the value of the re-rank layer; on unambiguous lexical queries both saturate, so the layer is a policy (scope/trust) rather than an accuracy gain.
- Corpus holds near-duplicate distractors (deadlock on RefId vs OrderId, WAL vs SQLITE_BUSY) so ranking, not just matching, is measured.
- Multi-relevance queries (e.g. stock drift + warehouse transfer) make recall@5 meaningful.
- Floors enforced by the test: hit@3 >= 95.0%, recall@5 >= 90.0%, MRR >= 0.9, miss <= 5.0%, p95 <= 60ms.
- Measured hybrid latency: p50 0.82ms, p95 1.26ms on this machine.
