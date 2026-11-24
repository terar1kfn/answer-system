# Answer System

A reusable, local-first IT diagnostic decision engine. Version 0.8 is an isolated development milestone, not a production deployment. All bundled knowledge and incidents are synthetic. No private institutional code, student data, credentials, real catalog or live configuration belong in this public repository.

## Run the diagnostic lab

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

Not implemented: private application adapter, authenticated durable visit persistence, real tickets or recovery, incident ingestion, semantic retrieval or AI, real staff authorization, production persistent-session integration and deployment. Do not use the browser lab as a production API.

The host must keep issue state on the trusted side, authenticate visits, atomically enforce expected turns, revalidate published guides, authorize staff actions and deduplicate effects. The pure library is not an authorization boundary. See docs/contract.md.


The optional host authorization façade and advisory inference adapter are documented in [docs/host-integration.md](docs/host-integration.md). The advisor is disabled unless a trusted host explicitly injects a provider. Production authentication, durable storage and actual AI integration remain separate.


Expanded service taxonomy, eleven service-specific support areas plus identity/exam safeguards, documented error signatures, bilingual concept retrieval, conditional guide selection and an explicit private catalog adapter are described in [docs/diagnostic-coverage.md](docs/diagnostic-coverage.md). Validation is deliberately deferred during the feature-building phase.


Additional operational modules: optional local Ollama providers, revision-pinned hybrid retrieval, atomic single-writer persistence, reviewed catalog workspace, durable handoff metadata/dispatcher, aggregate analytics, monitoring signals, reviewed-case similarity and host-facing staff/guide/advisor commands. See [docs/operational-architecture.md](docs/operational-architecture.md). These are unvalidated build-phase modules; no live integration or provider connection has been enabled.


The new unified [development workbench](docs/workbench.md) connects fictional student, intern and manager workflows through the reference host service. It includes diagnostic correction and guide-progress tracking, scoped incidents, simulated delivery/reconciliation, knowledge review and optional synthetic metadata persistence. It is not a release or a hosted application. Validation remains deferred.


The [host assembly](docs/assembly.md) composes optional model/retrieval, guide resolution, diagnostics, durable handoff reconciliation, metrics, monitoring and a host-authorized OCR boundary behind explicit private integration callbacks. Informational paraphrases can ask the student to confirm a reviewed fact topic; pasted-error intake retains only documented signals. Feature code is unvalidated and no real host is connected.
