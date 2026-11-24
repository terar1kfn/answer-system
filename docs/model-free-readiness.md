# Model-free readiness and browser validation — 0.47

## Architecture and launch recommendation

Use the deterministic engine first. It runs on Node.js 22+ without model weights, Ollama, a GPU, an external AI API, or an inference subscription. Its catalog, fixed bilingual questions, evidence, approved guide selection, scoped incident notices, reviewed facts and reviewed-context rules, bounded recovery/alternatives, audit reports and verified-outcome learning are ordinary software. Host case and release verification still require actual authority. Knowledge learning here means reviewed patterns and evidence, not automatic neural-model training.

Optional local AI adapters may suggest an interpretation of ambiguous input or a visual observation. They are not the authority for a guide, case, permission or action. Visual interpretation in the current optional screenshot advisor needs a suitable local vision model; students can use text or fixed choices instead. The system must remain usable if inference is absent, disabled, busy, unavailable or timed out. Start with no model hooks, or enforce allowModelAdvice:false in native policy. Do not enable intake, contextual reply, screenshot or hybrid embedding inference in the initial production candidate. Native host feature switches for existing AI features are separate from the new engine's switches. Do not change existing AU Assist settings as part of this package.

## Executed initial tests

Baseline: v0.46.0 main e6b75eb6567f3e0b139ea172c731ea529710b28a, verified successful main CI at https://github.com/terar1kfn/answer-system/actions/runs/45377987394.

Validation commit 6832236b6bbd9f92d85987240675f14bb55e911d: https://github.com/terar1kfn/answer-system/actions/runs/45378621482.

- Node 22: 268 passed, 0 failed or skipped; 98 syntax modules passed.
- Concurrent synthetic native bridge: 32 visits, 12 rounds each, 4 operations per round, 1,536 operations. Reported elapsed 1,177 ms, per-operation p95 62 ms in that run. In-process fake hooks/one small fixture; not an HTTP, hardware, production-catalog, or sustained real-world performance benchmark.
- Browser job: actual Chromium on synthetic loopback previews. Two workbench scenarios passed (desktop guide/staff and mobile Arabic/session separation). Two diagnostic-lab scenarios failed: missing /src/diagnostic-evidence.mjs caused 404 and blocked the module graph. Add this exact module to the existing public allowlist, not a catch-all file server. Retest both jobs.
- No actual inference or real student information. Browser network requests restricted to the two loopback test origins. CI-only pinned browser driver is optional; no change to the engine's dependencies.

## Private integration gate

1. Use a current authenticated server-published configuration export, not a Git checkout or historical capture. Keep private catalog, mapping and approvals outside the public repository. Run the existing local reconcile:private utility with exact current source, reviewed mapping and policy; review withheld, changed, and unmapped records. Never auto-approve or silently repin.
2. Verify every eligible guide's service ownership, audience, risk, procedure completeness, native entry path, branching, and current exact source/route review. Independently approve the complete mapping; use createApprovedMappingProvider rather than a draft. Keep learned-context activation separate and off initially.
3. In a private staging environment, supply the existing student authentication, visit identity/lifecycle, feature switch, native-first protected/exact routing, current policy, eligibility, current mapping, native guide opening, request lookup and recovery-verification hooks. Keep model hooks absent and allowModelAdvice false.
4. Bind the existing native UI to createEmbeddedAssistantController and createHomeSearchController; use server-authoritative issue/version and guard effects immediately before consumption. Do not replace native ticket, MFA, exam or staff processes. Test existing direct routes and feature-off fallback.
5. Exercise authorized synthetic staging identities for diagnosis, guide launch/return/outcome, ticket draft and deduplication, genuine native recovery completion, role isolation, expiry, source publication changes, and rollback. Test desktop/mobile/tablet on the actual staged application, not just these independent previews.
6. Review staging measurements and privacy before independent approval for a limited deployment. Model-free deployment has no model prerequisite. Enable an optional model only after separate measured benefit, resource, privacy and accuracy validation; keep its absence/failure nonblocking.

The repository does not implement or claim private application activation, actual current source reconciliation, real native identity/database verification or deployment. Preserve the native host's existing workflow whenever the supplemental feature is off or unavailable.
