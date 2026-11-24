# Adaptive identity diagnosis — 0.10

This is an implementation of reported troubleshooting scenarios, not a claim that any account has been inspected. In the mature host, native safety, guide and recovery policy remains authoritative.

## Common journeys

1. Vague email/service problem: ask whether sign-in, sending, receiving, or another function is affected. Do not route all email problems through Authenticator.
2. Sign-in problem: ask whether setup has been performed, then what actually happens on the student's affected device. Not knowing the app or reporting no setup is not sufficient to diagnose the prompt.
3. A setup screen or explicit setup request: ask phone type, select the existing approved platform-specific guide. Do not generate a replacement procedure.
4. A blocked approval/code, or phone migration: ask whether any previously registered verification method is usable. A lost phone alone does not establish that all methods are unavailable. Never ask for a code or password.
5. No usable registered method: offer the native, identity-verified recovery request. No account action is performed by the engine. An uncertain answer goes to authorized support.
6. Failed setup guide: distinguish a blocked old verification method, installation failure, registration failure, and completed setup with continuing service failure. Do not repeatedly return the same guide.
7. Staff-verified recovery: clear stale pre-recovery observations, permit the existing setup guide once again, and verify the original task. A continuing blockage after verified recovery is a technician review, not another automatic reset.
8. Setup completed, service still fails: ask about the new sign-in attempt, credentials being accepted, the actual connection on the affected device, and whether other services work. Never equate successful MFA configuration with successful sign-in.
9. Mail-delivery failures: retain delivery-specific diagnosis; a verification-code prompt is not automatically missing email. Do not infer a recipient count limit without an approved policy.
10. Unexpected authentication request: protected referral. Do not ask the student to approve it.

The logic distinguishes student-reported signals from staff-verified recovery. Existing incident confirmation requirements, native service availability, authorization, sensitive-topic handling and exam routing are not replaced.

## Deferred validation

The new questions deliberately change several former scenario expectations (for example, a response of "not set up" now asks about the actual prompt, and a typed lost-phone statement no longer proves that no registered method works). The preserved regression suite must be updated and extended in the later consolidated validation phase. No tests, syntax checks, model calls or browser runs were executed in this milestone.
