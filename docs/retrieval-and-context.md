# Retrieval and contextual diagnosis — 0.15 (validation deferred)

## Context before questions

The first message can contain the problem and independently phrased observations. Exact, domain-appropriate clauses about verification, credentials, connectivity and mail-client scope may prefill structured reported evidence. The protected-context classifier still sees the full message. A recognized "other websites work" clause can separate connectivity context from an actual multi-service report. The engine does not infer an observation from a mention, invent missing values, or authorize recovery from compound text.

If explicitly reported observations conflict, retain an unresolved question ID rather than arbitrarily choosing one value. The engine clarifies the conflicting observation before ordinary guidance, preserving protected and restricted paths. A current answer resolves that conflict; earlier evidence is not automatically a confirmed root cause. This is a conservative phrase-based initial parser, not a general language model.

## Reviewed retrieval

The revision-pinned engine can construct an in-memory metadata retriever once per catalog. Ranking uses distinct normalized bilingual terms, field weights, inverse document frequency, coverage, bounded phrase matches and one-edit/transposition matching for non-numeric words. The score is not a calibrated probability. Search results include matched term/error metadata, not generated instructions.

Documented error-code queries require an explicit association in reviewed metadata; approximate matches on codes and numerical quantities are disallowed. Conflicting error codes do not produce a guessed guide. Exact reviewed aliases still outrank related topics. Multiple exact approved factual records are a conflict, not a license to select one; ambiguous topic choices with identical display names are excluded. Factual topic retrieval searches facts separately from guides.

Student search respects the admitted diagnostic service scope, availability, audience and review status. Protected exam/safety input and screened personal information do not produce free search results in the generic student search interface. Hybrid retrieval cannot override an exact phrase or documented code route and remains optional. Native policy routing, original complete guides and institutional source ownership remain authoritative.

## Diagnostic question choice

When several eligible guides have unknown safe platform/client prerequisites, choose the question that partitions the relevant candidates, favoring one that distinguishes more alternatives. Only device OS, phone and supported-browser scope can be automatically asked by this mechanism. Safety, identity, policy and administrative prerequisites are not reordered by scoring.

## Reviewed case relevance

Staff-only case matching accepts unique, allowlisted structured signals and excludes protected issues. Rank explicit matches by their diagnostic discriminating value, reject contradictions, report missing evidence and prerequisites, confirm original service ownership and recheck guide eligibility. A previously unsuccessful guide is identified; missing proof of outcome is never invented. A strong match requires multiple supporting signals, complete prerequisites and a host-reviewed verified outcome. All matches still require human review and cannot directly authorize a guide.

The implementation is deliberately unvalidated during the feature-building phase. No tests, builds, browser runs, model calls, real case imports, deployments or private repository modifications were performed.
