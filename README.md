# Answer System

A reusable, local-first IT diagnostic decision engine. Version 0.3 is an isolated development milestone, not a production deployment. All bundled knowledge and incidents are synthetic. No private institutional code, student data, credentials, real catalog or live configuration belong in this public repository.

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
