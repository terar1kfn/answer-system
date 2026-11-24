# Extended adversarial validation — 0.46

Baseline: package 0.45.2, main bb3e01a32560d3224aa674d488bb79c57eb3da6c, 221 passing regressions. The isolated validation branch adds 41 cases. The initial test-only commit 33cd06595cbe026bec326ae2cccbb4ef51ac6ad6 ran at https://github.com/terar1kfn/answer-system/actions/runs/45377629989 and reported 97/97 syntax checks, 234 passed, 28 failed, 0 skipped/cancelled. Ten bounded breadth-first cases explored 1,245 valid state transitions across bilingual ordinary, identity, shared, unknown and exam paths, checking input immutability, eligible guide IDs and bounded questions. This is not exhaustive or a performance benchmark.

## Findings and corrective changes

- Assistant client (11 reproduced failing tests): reentrant render/activity cancellation could still reach transport or effects; throwing renderer could strand a request; same-visit reads could regress; mismatched issue/action/channel or incomplete guide reference could pass; unknown response metadata was retained. Guard current generation before transport/effect, release pending state, enforce monotonic version/issue and action response contract, explicitly project public data.
- Home search (5): similar cancellation/render races, missing native consumption guard, retained unbound input, reusable disposed instance. Add isCurrent and cancellation checks, no unbound input, release pending state and prevent rebinding disposed instance.
- Mapping release (3): mutable verified envelope or concurrently revoked envelope could be returned; row approval independence was not structurally rechecked at consumption. Clone the initial snapshot, check the approval fields and compare the actual current envelope after the verification await. Verification callback must still validate actual independent native records.
- Native navigation (3): incomplete source/step metadata accepted, overlong procedures admitted despite route limit, legacy/branched counts lacked a public scope marker. Share the exact reference validator and align the 200-step bound with route review; expose root_resolution or unconfirmed.
- Local Ollama transport (4): pre-cancelled requests still called fetch, a mock ignoring abort could return a late successful response, early HTTP or declared-size rejection left a body open. Check abort before/after transport and streaming, cancel unused streams, reject malformed UTF-8, preserve actual resource leases. Mock fetch only; no actual model contacted.
- Native requests (2): a recorded request could appear while preparing a draft, or change while a recovery completion was verified. Repeat the authoritative request read and current policy check; never offer a duplicate draft on uncertainty or resume a different request.

Package version 0.46.0; deterministic engine RULE_VERSION remains 0.45.2, since question/selection rules did not change. Guide metadata and availability changes still invalidate native catalog pins. This is intentionally not a native database, real browser/phone/vision/model test, live deployment or verified university policy. Host must perform final authorization and durable transactional deduplication immediately before actual effects. No private catalog or actual student data is included. Verify all tests on the corrected branch before moving main.


## Verified corrected run

- Tested package: 0.46.0. Tested source commit: 377159ba9023dfc277f724c8c875e6e1c8af6339.
- GitHub Actions (Ubuntu, Node.js 22): https://github.com/terar1kfn/answer-system/actions/runs/45377871891 — completed, success.
- Syntax: 97/97 passed. Regression: 262/262 passed, 0 failed, 0 cancelled, 0 skipped, 0 todo.
- The same ten bounded diagnostic walks again exercised 1,245 transitions. All 28 previously failing assertions now pass; the 221 baseline cases remain registered and pass. No tests were removed or disabled.
- Main is eligible for fast-forward to the tested code plus this documentation-only record. The earlier baseline remains in history for rollback. Native integration and actual AI inference remain separate validation gates; no AU Assist live changes were made.
