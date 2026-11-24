# Trusted runtime — v0.3

This is a reference single-process, memory-only host coordinator. It is not an authenticated network API. The host MUST authenticate every call, derive the opaque visit reference and scope from server state, enforce role permissions, and choose persistent policy only for authorized test visits. No student ID or public whitelist is included.

## Visit and issue lifecycle

openVisit registers a host-verified visit. begin replaces an issue using a compare-and-swap visit version. respond validates the active issue and expected version before accepting the allowed option or conservative free-text answer. Stale or cross-visit requests are rejected. Catalog changes and expired incident notices require refresh; old guidance is hidden. Ordinary visits have idle and absolute limits; persistent visits ignore these diagnostic timers and require trusted staff termination. Host remains responsible for real session-token revocation, cleanup across browsers, auditing and access checks.

## Handoff intents

prepareHandoff requires a current support/recovery offer, explicit confirmation and idempotency key. An intent is NOT a ticket. Host executes the real existing workflow and calls recordHandoffResult with the verified outcome and host reference. Unknown delivery (including timeout) blocks retry and issue replacement pending reconciliation. Only definitive failure allows bounded retry with the same operation ID and key. Old attempts are rejected. A recorded recovery request is awaiting IT; only the trusted host may call resumeRecovery after independently verifying completion. This preserves the issue and asks for the existing phone setup guide, then verifies original task outcome. No privileged side effect is executed here.

Closing a visit scrubs issue evidence and unresolved-operation payloads. Uncertain operation markers are retained for reconciliation. Durable deduplication, retention, authorized callbacks, server-derived IDs and atomic compare-and-swap across processes must be provided by the real host.

## Incident registry

Signals are deduplicated per opaque visit, service and scope within a bounded window. These are not verified unique people. Three distinct visit signals form a suspected candidate, never an automatic outage. Staff methods create investigating records and transition them using expected revision. Only scoped, fresh, confirmed records may affect a student decision. Expired, dismissed and resolved records are excluded. Authorization and durable audit belong to the host.

## Knowledge review

A structured case-code proposal can be reviewed by a different authorized reviewer against the current catalog revision. Approval returns a publication candidate, never a published guide. The host's existing editor and validation workflow remains authoritative. Real case vocabulary, permissions and retention must be verified privately.

## Verification boundary

Core and runtime scenarios use fictional fixtures. Production HTTP authentication, durable storage, actual case integration, staff permissions, catalog mapping, existing exam protections, actual ticket delivery and real user/session tests remain required. Never accept a client-provided role, visit identity, persistent flag, catalog, incident or state as trusted. Keep real institutional configuration outside this public repository.
