# z-brain retrieval quality

Generated 2026-11-12T10:12:34.152Z
Corpus: 50 atoms (30 erp, 20 global) | Labeled queries: 50 | k=5

## Lexical set (gated regression)

| System | Hit@1 | Hit@3 | Hit@5 | Recall@5 | P@5 | MRR | nDCG@5 | Miss | p50 | p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hybrid (production) | 98.0% | 100.0% | 100.0% | 99.0% | 27.8% | 0.990 | 0.983 | 0.0% | 0.67ms | 1.20ms |
| raw FTS5 | 100.0% | 100.0% | 100.0% | 100.0% | 34.5% | 1.000 | 0.997 | 0.0% | 0.37ms | 0.67ms |

Ranking lift of the re-rank layer over raw FTS5: hit@3 0.0pp, recall@5 -1.0pp, MRR -0.010.

### Ranking errors (relevant atom present but not at #1)

- "database deadlock khi lưu phiếu nhập" expected [erp-deadlock-refid] but #1 was [erp-deadlock-orderid]

## Paraphrase set (informational, no lexical overlap)

| System | Hit@1 | Hit@3 | Hit@5 | Recall@5 | P@5 | MRR | nDCG@5 | Miss | p50 | p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hybrid (production) | 0.0% | 12.5% | 37.5% | 37.5% | 11.2% | 0.119 | 0.181 | 62.5% | 0.83ms | 1.41ms |
| raw FTS5 | 12.5% | 25.0% | 37.5% | 37.5% | 11.2% | 0.198 | 0.241 | 62.5% | 0.52ms | 0.65ms |

These queries express the same problem without reusing the atom's words. FTS5 cannot retrieve them; the score is the recall gap that a semantic layer must close.

## Notes

- `hybrid (production)` = `searchKnowledge()`: FTS5 BM25 with field weights (question 6x) on an absolute scale capped at 40, plus LIKE fallback. Scope, trust, tag (capped) and query-coverage bonuses only break near ties.
- `raw FTS5` = same sanitized query, BM25 order only. The gap is the value of the re-rank layer; on unambiguous lexical queries both saturate, so the layer is a policy (scope/trust) rather than an accuracy gain.
- Corpus holds near-duplicate distractors (deadlock on RefId vs OrderId, WAL vs SQLITE_BUSY) so ranking, not just matching, is measured.
- Multi-relevance queries (e.g. stock drift + warehouse transfer) make recall@5 meaningful.
- Floors enforced by the test: hit@3 >= 95.0%, recall@5 >= 90.0%, MRR >= 0.9, miss <= 5.0%, p95 <= 60ms.
- Measured hybrid latency: p50 0.67ms, p95 1.20ms on this machine.
