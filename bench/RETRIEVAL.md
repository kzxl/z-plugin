# z-brain retrieval quality

Generated 2026-11-12T09:56:31.964Z
Corpus: 50 atoms (30 erp, 20 global) | Labeled queries: 50 | k=5

## Lexical set (gated regression)

| System | Hit@1 | Hit@3 | Hit@5 | Recall@5 | P@5 | MRR | nDCG@5 | Miss | p50 | p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hybrid (production) | 92.0% | 98.0% | 100.0% | 100.0% | 28.2% | 0.952 | 0.962 | 0.0% | 0.77ms | 1.49ms |
| raw FTS5 | 92.0% | 98.0% | 100.0% | 100.0% | 34.5% | 0.954 | 0.963 | 0.0% | 0.36ms | 0.69ms |

Ranking lift of the re-rank layer over raw FTS5: hit@3 0.0pp, recall@5 0.0pp, MRR -0.002.

### Ranking errors (relevant atom present but not at #1)

- "database deadlock khi lưu phiếu nhập" expected [erp-deadlock-refid] but #1 was [erp-goods-receipt]
- "tồn kho bị âm sau khi giữ hàng" expected [erp-stock-negative] but #1 was [erp-stock-ledger-drift]
- "JWT hết hạn khi in hoá đơn" expected [erp-jwt-expiry] but #1 was [erp-goods-receipt]
- "tồn kho" expected [erp-stock-ledger-drift, erp-stock-negative] but #1 was [erp-goods-receipt]

## Paraphrase set (informational, no lexical overlap)

| System | Hit@1 | Hit@3 | Hit@5 | Recall@5 | P@5 | MRR | nDCG@5 | Miss | p50 | p95 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| hybrid (production) | 0.0% | 12.5% | 37.5% | 37.5% | 8.1% | 0.098 | 0.165 | 62.5% | 1.17ms | 1.36ms |
| raw FTS5 | 0.0% | 12.5% | 37.5% | 37.5% | 8.1% | 0.119 | 0.181 | 62.5% | 0.59ms | 0.72ms |

These queries express the same problem without reusing the atom's words. FTS5 cannot retrieve them; the score is the recall gap that a semantic layer must close.

## Notes

- `hybrid (production)` = `searchKnowledge()`: FTS5 BM25 + LIKE fallback + trust/tag/semantic trigram re-ranking.
- `raw FTS5` = same sanitized query, BM25 order only. The gap is the value of the re-ranking layer.
- Corpus holds near-duplicate distractors (deadlock on RefId vs OrderId, WAL vs SQLITE_BUSY) so ranking, not just matching, is measured.
- Multi-relevance queries (e.g. stock drift + warehouse transfer) make recall@5 meaningful.
- Floors enforced by the test: hit@3 >= 80.0%, recall@5 >= 70.0%, MRR >= 0.65, miss <= 5.0%, p95 <= 60ms.
- Measured hybrid latency: p50 0.77ms, p95 1.49ms on this machine.
