# Host integration contract — v0.1

Answer System recommends decisions. The existing host owns authentication, session lifecycle, published content, staff permissions, tickets and real account actions. A supplementary knowledge provider may eventually return reviewed references, not privileged commands.

    const engine = createEngine({ catalog, incidents, now });
    let state = engine.begin({ text: "Cannot login to Moodle", language: "en" });
    state = engine.advance(state, {
      expectedTurn: state.turn,
      questionId: state.decision.questionId,
      optionId: "yes"
    });

Catalog: revision string and guide array; each guide has id, stable serviceId, purpose, enabled/reviewed booleans, audience ("student" or "staff") and bilingual title. Inject a validated, approved snapshot. Never trust client-provided catalog metadata. The host resolves IDs to complete original instructions with their prerequisites, warnings and images; no model rewrites the procedure. Missing or ineligible references become support offers.

Input: 1–500 characters; en or ar. Raw query is processed transiently and not retained in state. Redaction and safety detection are best effort, not guarantees. Evidence distinguishes student text signals and explicit answers; neither is verified telemetry. Unknown is not no. A new issue gets independent state.

| Decision | Host action |
|---|---|
| ask | Render the fixed question and allowed options |
| open_guide | Revalidate against current catalog; show complete reviewed guide, ask outcome |
| offer_mfa_recovery | Offer existing staff-managed recovery after explicit confirmation; never reset automatically |
| offer_support | Offer existing support submission; no automatic ticket |
| incident_notice | Display fresh scoped staff-confirmed incident |
| safety_referral | Safe staff/professor referral; avoid disruptive steps |
| resolved_reported | Student reports the original task works; not independent proof of root cause |

The demo uses synthetic incident records. Real authority must be determined by host authentication and role checks. A student report alone never confirms an outage. Current prototype scope is service-level, not campus/building/device-level. Stale, expired, unconfirmed and unauthorized records are ignored. Real status integration needs freshness, scope, ongoing refresh and incident lifecycle.

Advance verifies the pending question, valid option and exact expected turn. State is copied, but this is a pure function, not a replay-resistant store: evaluating an old state again is possible. The host must store authoritative state per authenticated visit, atomically compare-and-swap turn revisions, reject stale/replayed requests, support cancellation, and clear data at visit end. Never trust serialized state from an untrusted client as authorization. Host must require explicit permission and idempotency for all real side effects.

## Current limitations

Lexical rules only; limited English/Arabic patterns and bounded choice follow-ups, not arbitrary conversational AI. No independent identity or account verification. No real university-specific policy, email limit, or reset process is assumed. Demo guides are placeholders for an approved content adapter. The demo has no accounts, storage, analytics, external network requests or real notifications. Actual runtime compatibility with the private application remains unverified.

## Delivery plan

1. Extend deterministic intent/evidence rules, build a private anonymized benchmark, measure diagnostic correctness, unnecessary questions, fallback and unsafe routing.
2. Build private catalog/availability adapter; preserve current published guide IDs and revision; retain the existing exam protections and MFA workflow.
3. Implement authenticated visit-scoped route in host with atomic version checks, explicit handoff and independent feature flag (off by default); do not replace the existing home layout.
4. Add manager-confirmed incident lifecycle, then deduplicated signals; no automatic confirmed outages.
5. Add structured support context and reviewed knowledge-gap proposals; no automatic publication from private tickets.
6. Evaluate optional semantic retrieval and local model suggestions using measured improvement. Model can propose allowed IDs/evidence, not execute actions or invent policy.
7. Implement persistent test-session policy separately in private host, with staff authorization and cleanup/security tests.
8. Test, review and roll out incrementally. Maintain a rollback switch and preserve operational records.

No live integration, port changes, credential sharing or publication of private materials is authorized by this repository.


## v0.2 extension

The engine exposes respond(state, {expectedTurn, text}) for conservative, bilingual free-text replies to the pending question. Unrecognized or contradictory replies return a clarification without advancing; a recognized protected safety signal interrupts the normal path. New unrelated issues require an explicit begin. Do not reinterpret arbitrary free text as a valid option.

Search returns ranked, eligible metadata only. Exact reviewed fact aliases can yield a source-bound answer; ambiguous, unreviewed, inaccessible or fuzzy-only matches cannot produce an answer. Catalog facts include id, serviceId, title, aliases, answer in both languages, sourceRef, audience, reviewed and enabled flags. Service availability can be injected as a trusted map of service IDs to booleans. This is a simple lexical index, not a semantic vector model. Candidate causes carry candidate/supported labels with supporting evidence keys. Student answers never become staff-confirmed root causes.


## v0.3 runtime

See [runtime.md](runtime.md) for the trusted visit coordinator, explicit handoff/recovery intents, scoped incident registry and reviewed knowledge proposal queue. All real operations and identity checks remain host responsibilities.
