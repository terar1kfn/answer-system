# Host integration boundary — 0.4

createAnswerService is a reference application-facing façade. It is not a deployed web API. The private host supplies authenticate(credential), derives the opaque visit ID, location scope and authorized persistent-session flag, and supplies all authorization and verification callbacks. Client commands have strict field allowlists. A student cannot set role, identity, scope, policy or evidence. Staff operations default to denied until the host authorizes the target or scope.

The student view omits host visit and handoff payload references; issue ID/version remain non-authorizing concurrency tokens. Student finish and staff termination report closure only after the host independently confirms authentication revocation. Persistent sessions cannot be ended through the student command. Expired/ended visits cannot be reopened under the same token in this runtime. A production host must use durable revocation, unique session IDs, atomic state and authorization at every request.

prepare_handoff returns only an intent. The host resolves the authenticated visit on the server, calls the trusted prepareForHost hook with the same key, and executes its existing idempotent delivery workflow. recordHostDelivery is not a student command; only the trusted adapter can confirm actual delivery. The host must retain a durable reconciliation ledger and verify recovery completion before a staff recovery command may resume the original issue. For retry, the existing operation identity and new attempt are passed through the trusted host integration; the host must coordinate a single delivery attempt and use its durable ledger. No ticket, reset, message, monitoring probe or privileged call is executed automatically by this package.

Incident reports derive service/scope from the supported shared-network diagnosis and trusted visit. The manager confirms only within authorized scope. Knowledge proposals remain private draft metadata until the authorized editor validates and publishes them to the real catalog.

## Optional model advisor

The advisor is OFF by default. A host may inject a local provider function and enable it for an ambiguous pending question after privacy review. The request contains only a bounded question, allowed options and a short, screened reply. The provider may return exactly one allowed option ID. Unknown IDs, additional fields, invalid responses, protected contexts, detected identifiers/secrets, errors, timeouts and concurrent requests are rejected or fall back. A valid suggestion still requires explicit student confirmation; it cannot alter diagnostic state. No cloud or local provider connection, model URL, key, model weight, prompt log or generated university instruction is bundled. Pattern-based screening is incomplete; real privacy controls must be approved before enabling any inference.

## Remaining integration gates

- Bind to the actual private application's authenticated visit/session and permission contracts.
- Verify current published catalog and service identity mapping; preserve existing procedures and protected exam routes.
- Use durable, atomic versioning and operation ledger, authenticated staff callbacks, safe retention/cleanup and explicit rollback flags.
- Connect the existing recovery/ticket workflow only after authorized preview and independent testing.
- Benchmark optional model inference against deterministic fallback before enabling it for real students.
- Validate live browser UI, security, performance, bilingual accuracy and real student outcomes.

The public repository is intentionally isolated and synthetic; none of these development changes are a live integration or authorization to expose university data.
