# Native assistant client and guide continuation — 0.12 (validation deferred)

This is a framework-neutral controller for integration into the existing student assistant. It does not replace its React layout, authenticate students, create tickets, set session timers, connect to an endpoint, or store chat history. The private host supplies request(command,{signal}), onChange(view), onEffect(intent,{signal,isCurrent,issueId,version}) and recordActivity(). Never expose privileged operator hooks through this controller.

## Lifecycle

Bind a local opaque visit key, then explicitly read the bridge state. A new visit clears the prior UI. Commands use the currently displayed version and issue ID; choices must belong to the currently displayed question. Only one call is allowed in flight. Stop, language rebinding, disposal and visit changes abort transport and invalidate pending results. Aborting a network request does not establish that the server stopped. After cancellation or uncertainty, explicitly read authoritative state before another mutation. Do not automatically replay a mutation or support draft.

An effect is a guarded native navigation/request-intent object. The native application must check isCurrent() immediately before applying it, including after any asynchronous work. A transport error never automatically submits a fallback ticket or second search. Delegate effects tell the existing native assistant to use its own routing; retain any original input only as transient UI context for that deliberate submission. No raw query is included in the bridge response or stored by the controller.

Localized interface copy is separate from institutional procedures. Unknown reason codes return null so the host can show its neutral existing fallback rather than exposing a raw internal error.

## Native guide lifecycle

An offered guide, a viewed guide and a resolved original task are different events.

- open_guide returns the exact native guide reference, publication fingerprint and opaque launchRef. It records the handoff intent, not actual navigation. Reopening the same offer returns the same launchRef.
- The host opens its original complete guide only after checking live publication, ownership, permissions and fingerprint again. Preserve the original branching, step images, warnings, Back/Next/Done behavior. A fingerprint is a consistency token, not authorization.
- The native host associates the authenticated guide navigation record with the issue and launch reference. The student may return to the assistant and explicitly refresh_native_guide. The trusted getNativeGuideReturn hook may return {status:'returned',verified:true,launchRef,guideId,catalogRevision,nativeGuideFingerprint,reachedStep,totalSteps}. No step count or completion claim is accepted from the student's command.
- A matching verified receipt contributes factual viewed-step metadata to the native support journey. A missing receipt is pending, not a failure or completed guide. Only an explicit student outcome is a reported resolution. Completing Done or returning Home never closes the authenticated session or proves the original task is fixed. Native host may retain its existing outcome interaction even if progress reporting is not available.

The catalog fingerprint now includes a digest of each approved private native guide, not merely metadata. The host can detect a procedure change even when a publication revision was accidentally reused. Raw guide bodies are not copied into the public repository or bridge view.

## Recovery and evidence

Recovery continuation requires a recorded native MFA request for the same issue/visit and a separate verified completion callback referring to exactly that request. No guessed reference or client completion flag is used. The native ticket journey delta includes fixed labels for recognized compound observations and only verified guide-return counts; the host merges and sanitizes it with its authoritative recorder. A possible new scope is clarified without discarding the active issue.

The bridge binds rows to the authenticated actor as well as the opaque visit reference. It still relies on the host for session uniqueness, native authorization, lifecycle cleanup and final consumption-time checks. This is a transient single-process integration contract, not a deployed application.

No runtime, test, build, browser, provider or live integration execution performed in this milestone.

## Boundary hardening (0.46)

Render and activity hooks may synchronously cancel or rebind the UI. Transport and effect callbacks are not started after such invalidation. UI rendering exceptions during requests release the pending lock and require a refresh. Within one bound visit, authoritative versions cannot regress (including reads) or swap an issue at the same version. A mutation cannot consume a different issue or a response effect belonging to another action. Native guide references require exact hashes, valid source and bounded step metadata; unconfirmed navigation counts carry progressScope: unconfirmed. Client snapshots and effect arguments project only the defined public fields. The home-search submitNative hook additionally receives isCurrent() and must check it and the abort signal immediately before any delayed native action. Disposed search controllers cannot be rebound; create a fresh controller. The native host still owns authentication, request deduplication, final effect authorization and actual navigation.
