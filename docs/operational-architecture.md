# Operational architecture — 0.6 (validation deferred)

## Optional local inference

The local Ollama adapters are explicitly opt-in and perform no calls on construction. Chat classification uses a fixed loopback endpoint, bounded input/output, structured option-ID output, redirect rejection and no model downloads. The existing advisor screens personal data and protected contexts and returns an advisory option requiring student confirmation. The host rechecks issue identity/version after inference; it never applies a model answer automatically. No actual local service, port, model, provider account or deployment has been contacted or configured.

Reference API contracts:
- https://docs.ollama.com/api/chat
- https://docs.ollama.com/api/embed

Hybrid retrieval builds a revision-pinned vector index only when a trusted host explicitly requests a rebuild. It uses eligible, reviewed metadata rather than raw private guides or tickets. It combines lexical and semantic ranks, preserves exact matches, limits input and index size, and degrades to lexical search on errors, stale indexes or unavailable providers. Similarity is an uncalibrated ranking signal. Semantic hits never authorize a guide, generate a factual answer or grant access.

## Durable operational metadata

The atomic JSON store uses an exclusive single-writer lock, bounded validated state, expected revision, temporary-file fsync and same-directory atomic replacement. It is not a distributed database, and directory fsync is platform-dependent. After a crash, a stale lock requires explicit operator investigation; do not blindly remove it. The data directory must be private and access-controlled, outside the public repo. This is a reference single-writer store, not encrypted multi-process production storage.

The catalog workspace supports staged drafts, independent review, explicit supplementary-workspace publication, revision history and restore-as-new-draft. It must not supersede the actual application's published catalog. The host remains authoritative for institutional knowledge.

The delivery ledger persists only opaque operation identity, attempt, status and host reference, not the diagnostic payload. A dispatcher claims a delivery before invoking the injected host adapter. Unknown/sending states require reconciliation, not blind retry. Only definitive no-effect failure permits another attempt with the same idempotency identity. Actual destination idempotency and retention remain host responsibilities.

## Other operational features

- Aggregate-only metrics (counts, service, reason, day), bounded retention and small-group suppression. No raw text or personal IDs in metrics. A reported resolution is not a verified root cause.
- Health observations from explicitly configured, trusted probe IDs, with freshness and consecutive failure counts. These are suspected signals for staff review, not automatic incident confirmation; no arbitrary URLs are probed.
- Reviewed structured case similarity matches evidence against anonymized approved patterns and rechecks the current guide catalog. Results are recommendations for authorized staff.
- Host commands add scoped active-visit listing, authorized issue inspection, case suggestions, manager metrics/monitoring, optional advisory suggestions and active-guide resolution. Guide content is returned only through the host's authorized resolver for the active guide and revision. No real host callback is installed here.

The isolated application's current transient visit coordinator remains memory-only by design. Durable ledger/catalog/metrics are optional host modules; no real persistence deployment has been configured. Multi-worker atomicity, actual university role mapping, authentication, browser/session invalidation, durable incident audit and private live catalog mapping remain separate integration work.

No regression, syntax, benchmark, browser or integration tests were run for this milestone. No real student data, university configuration, live actions or private repository edits.
