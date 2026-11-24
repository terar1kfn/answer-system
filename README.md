# Answer System

A reusable, local-first IT diagnostic decision engine. Version 0.22 is an isolated development milestone, not a production deployment. All bundled knowledge and incidents are synthetic. No private institutional code, student data, credentials, real catalog or live configuration belong in this public repository.

## Development status

Feature-building phase: validation deferred. Do not run or deploy an intermediate version. Existing regression commands are retained for the later explicitly authorized validation phase.

## Diagnostic lab (later validation only)

Requires Node.js 22+. No dependencies or AI keys.

    npm test
    npm run check
    npm run demo

Open http://127.0.0.1:5387/ in your browser. Stop with Ctrl+C. The server binds only to loopback and fails if the port is occupied. Do not enter real student records or credentials.

Test English/Arabic descriptions, adaptive questions, MFA recovery recommendations, email delivery errors, simulated network incidents, and safe exam referral. The inspector shows structured decisions and reported evidence, not hidden AI reasoning. No actual ticket, reset or alert occurs.

## Design

    Host app / lab
         |
    classify -> diagnostic rules -> approved guide / question / support
         |
    typed decision and issue state
         |
    Host authorizes and performs real actions

- src/classify.mjs: bounded bilingual lexical interpretation.
- src/questions.mjs: fixed bilingual question definitions.
- src/engine.mjs: pure diagnostic orchestration and guide selection.
- src/demo-knowledge.mjs: fictional guide fixtures.
- demo/: local browser lab.
- tests/: repeatable scenario suite.
- docs/contract.md: integration boundaries and roadmap.

Implemented: conservative free-text follow-ups, reviewed exact fact answers, lexical retrieval, evidence-linked candidate causes, identity/MFA, email delivery, connectivity, basic exam/safety priority, fresh scoped incident notices, eligibility checks, explicit resolution feedback, bounded issue state.

Additional host reference modules: in-process visit coordinator, explicit idempotent handoffs, scoped incident registry, and reviewed knowledge proposal queue. These are not authenticated production endpoints.

Not implemented: actual private application wiring and reviewed native guide mapping, production multi-worker visit persistence, real tickets/recovery callbacks, enabled local inference, production persistent-session integration and deployment. The embedded integration layer is written but unvalidated. Do not use the browser lab as a production API.

The host must keep issue state on the trusted side, authenticate visits, atomically enforce expected turns, revalidate published guides, authorize staff actions and deduplicate effects. The pure library is not an authorization boundary. See docs/contract.md.


The optional host authorization façade and advisory inference adapter are documented in [docs/host-integration.md](docs/host-integration.md). The advisor is disabled unless a trusted host explicitly injects a provider. Production authentication, durable storage and actual AI integration remain separate.


Expanded service taxonomy, eleven service-specific support areas plus identity/exam safeguards, documented error signatures, bilingual concept retrieval, conditional guide selection and an explicit private catalog adapter are described in [docs/diagnostic-coverage.md](docs/diagnostic-coverage.md). Validation is deliberately deferred during the feature-building phase.


Additional operational modules: optional local Ollama providers, revision-pinned hybrid retrieval, atomic single-writer persistence, reviewed catalog workspace, durable handoff metadata/dispatcher, aggregate analytics, monitoring signals, reviewed-case similarity and host-facing staff/guide/advisor commands. See [docs/operational-architecture.md](docs/operational-architecture.md). These are unvalidated build-phase modules; no live integration or provider connection has been enabled.


The new unified [development workbench](docs/workbench.md) connects fictional student, intern and manager workflows through the reference host service. It includes diagnostic correction and guide-progress tracking, scoped incidents, simulated delivery/reconciliation, knowledge review and optional synthetic metadata persistence. It is not a release or a hosted application. Validation remains deferred.


The [host assembly](docs/assembly.md) composes optional model/retrieval, guide resolution, diagnostics, durable handoff reconciliation, metrics, monitoring and a host-authorized OCR boundary behind explicit private integration callbacks. Informational paraphrases can ask the student to confirm a reviewed fact topic; pasted-error intake retains only documented signals. Feature code is unvalidated and no real host is connected.


For an existing support application, use the [embedded integration contract](docs/embedded-integration.md) rather than replacing its workflows with the standalone workbench. The new bridge preserves native authentication, routing, published guide ownership, support and recovery queues, and cleanup. A separate search controller and server-side session policy resolver are provided. No private integration has been enabled.


The refined identity flow distinguishes observed sign-in screens, setup knowledge, usable registered methods, initial setup, verified recovery, and the original service outcome. A failed setup guide can lead to a more specific blocker question rather than repeating the guide or treating a lost phone as proof of a required reset. See [docs/identity-diagnostics.md](docs/identity-diagnostics.md).


The [conversation and shared-access layer](docs/conversation-and-shared-access.md) supports conservative compound replies, bilingual input forms, cross-service fault clarification and more detailed email-delivery checks. All behavior remains unvalidated in the current build phase.


The [native assistant client](docs/native-assistant-client.md) adds a guarded lifecycle controller for the existing UI, verified native guide-return receipts, original-task outcome separation, localized clarification copy and recovery-request reference binding. No actual host transport has been connected.


The [private catalog mapping and coverage review](docs/catalog-mapping-review.md) inventories required guide purposes, reports mapping gaps and potential prerequisite overlaps, proposes eligible metadata-only review leads, and prepares explicit unapproved mapping drafts. It does not publish knowledge or run against a real catalog by itself.


[Evidence and alternative diagnosis](docs/diagnostic-reasoning.md) adds relative support/contradiction ranking, an explicit uncertainty summary, and bounded second-line diagnosis after an unsuccessful guide. Alternatives require fresh reported evidence and a different eligible reviewed purpose. Validation remains deferred.


[Retrieval and contextual diagnosis](docs/retrieval-and-context.md) adds field- and rarity-weighted bilingual retrieval, exact error association, factual-answer conflict handling, conservative initial-observation reconciliation, discriminating prerequisite selection, and evidence-weighted reviewed case matching. No real university knowledge or cases have been imported.


[Reviewed contextual guidance](docs/reviewed-context-learning.md) adds an optional resolved-case-derived disambiguation layer inside existing approved guide selection. It requires fixed evidence, exact service/purpose, current revision, independent review and explicit private publication. No real case data has been imported.


[Current error evidence](docs/current-error-evidence.md) integrates confirmed newly reported error signatures into ongoing diagnosis, preserving service scope and earlier attempt history without treating a code as a verified root cause.


[Optional contextual reply interpretation](docs/contextual-reply-advice.md) adds a native-bridge fallback for unclear ordinary replies, with fixed current-question options, bounded structured context, quote validation, abstention and explicit student confirmation. Local provider and per-policy enablement remain unconfigured.


[Source-bound reviewed answer composition](docs/reviewed-answer-composition.md) combines uniquely matched approved informational facts with exact source references and consumption-time packet verification. The generic lab can display multiple answer sections; native informational routing remains authoritative.


[Private native mapping snapshot contract](docs/native-mapping-snapshot.md) supports pinned source and procedure fingerprints, explicit diagnostic-entry preservation, and more precise network and attendance mapping prerequisites. Institution-specific mapping files stay private and require independent review and live catalog reconciliation before activation.


[Private catalog reconciliation](docs/catalog-reconciliation.md) compares exact publication/guide fingerprints, ownership and availability, withholds changed or held mappings, and prepares a new private review candidate without activation. The local report utility requires explicit host-policy evidence and authorized snapshots.


[Source-grounded gap review](docs/source-knowledge-review.md) adds private source-attributed bilingual proposal intake, per-source review hooks and independent applicability review. New diagnostic distinctions cover forgotten passwords, MFA notification/method access, mobile learning setup, assignment type, online requests, attendance QR task and client-specific mail/meeting guidance.
