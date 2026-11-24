# Embedded integration contract — 0.9 (validation deferred)

The standalone workbench is a synthetic development environment. A mature support host already has its own identity, student home, service cards, native guide renderer, protected exam routes, support drafts, MFA recovery, staff queue, notification system and publication workflow. Do not install a parallel copy of these systems. The embedded bridge is the preferred integration path for that host. The older generic assembly remains a reference for greenfield hosts only.

## Native-first routing

The private host wires its current sensitive-topic detector, active-exam logic, exact guide matcher, native service routing and feature switch into the required routeInput hook. Existing protected and exact routes take precedence. An admitted unresolved issue receives an opaque server-selected scope key, never a client-selected authorization scope. The bridge rechecks the authenticated student visit, enabled flag, policy revision, scope and projected catalog around asynchronous operations. Protected/sensitive decisions encountered inside the supplementary engine are delegated to the original safe route. The native host must render that fallback; it must not reinterpret it as permission to produce general advice.

## Published catalog

Provide the current server-published configuration, NOT a stale frontend bundle or seed file. Private mapping rows are:
- services: {nativeId, serviceId}, where serviceId is the generic taxonomy.
- guides: {guideId, nativeServiceId, purpose, requires?, errorSignatures?}.
- revision: a version of the reviewed mapping.

Availability, ownership, review, menu identification and student/self-service permission are independent mandatory checks. An unowned legacy guide requires explicit ownership verification; equal display categories do not establish ownership. Disabled, hidden, unapproved, staff-only and direct-support cards cannot gain guide eligibility through search. The policy has a separate diagnostic scope: a host can explicitly permit shared sign-in or connection questions about an unavailable application without exposing that application's disabled guides. The bridge never enables a card. It returns a reference to the original complete guide; original branching, step warnings, images and review metadata remain native.

The projection uses a deterministic metadata revision. A change invalidates stale choices. No actual mappings, catalog bodies or internal service IDs belong in this public package.

## Student interface

Use the existing search submission entry point to open the existing assistant; place a compact search form immediately above the existing service-card grid. Keep existing card order, icons, navigation, and native availability. Keep one left-to-right layout in both languages, with direction-aware text. The provided search controller is a small framework-neutral client lifecycle helper, not a replacement React application. It aborts outstanding submission on visit/language changes, preserves the input on error and reports only deliberate student activity.

The host invokes the embedded bridge from its existing authenticated gateway. Do not publish a new standalone endpoint without native authorization middleware. Render fixed questions/choices, carry issueId and expectedVersion with every mutation, and discard stale responses. Clear pending UI on native visit cleanup. Existing exact/protected flows remain available even when the feature switch is off. No deployment has been made.

## Requests and session lifecycle

prepare_native_draft only returns an intent to open the existing native draft. It checks the native request lookup separately for support and MFA recovery. Existing recorded requests are shown instead of creating duplicates. Unconfirmed delivery is not treated as definitive failure. Actual submission, one-ticket-per-visit limits, identity checks, idempotency, screenshots, notifications, staff permissions and reconciliation remain native. Recovery continuation needs independently verified completion for the same live visit and issue; a browser-supplied "done" is not evidence of a reset. Original setup guides remain native.

Supplemental journey deltas carry fixed question/answer labels and recognized error codes only. The host merges these with its actual journey recorder and sanitizes again before ticket submission. No fabricated guide progress or room, no raw transcript, identity, image, password or OTP is included.

No extra session timer or session-token service is created. forgetVisit and clearAll are trusted cleanup hooks, called on host sign-out, expiry, staff termination, revocation and rollback. The optional session policy resolver returns an authorized persistent-session policy only after the native host verifies a server-side entitlement; ordinary limits are retained for everyone else. The native application must actually implement that policy in both gateway and UI. This is not a current persistent-session exemption.

## Outstanding private integration gates

Wire the actual router and gateway, review and populate real guide mappings, preserve native ticket and MFA workflows, define how the existing approved recovery-completion state is verified, implement staff-authorized persistent-session policy in native authentication, and connect the existing student UI. The bridge is a single-process transient supplement; a multi-worker host needs a shared atomic state mechanism or explicit single-owner routing. Test and verify all behavior in the later validation phase.

No private source copied. No real auth, request, catalog publication, provider call, build, test execution or live app change. Automatic regression checks remain manual-only.
