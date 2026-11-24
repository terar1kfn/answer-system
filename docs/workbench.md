# Unified development workbench — 0.7

The workbench is a new isolated, loopback-only development environment. It is NOT a production student application or actual university authentication. It uses fictional personas, approved-fixture guides, simulated requests and incidents. It does not connect to any existing service. It is not a redesign of the live student interface.

## Connected features

- Student search above generic service cards; English/Arabic questions, typed follow-ups, reviewed factual answers, guide navigation and outcome reporting.
- Structured diagnostic inspector with evidence origins, hypotheses, documented error signals and viewed guide progress.
- Correct previous answer, clear an active issue, and change language without starting a new visit; no undo through a safety referral or in-flight handoff. The engine reevaluates a trusted snapshot on correction.
- Normal and explicitly authorized fictional persistent personas; simulated host revocation and staff-only termination.
- Explicit fictional support/MFA intents, durable metadata option, destination failure/lost-reply modes, reconciliation and verified fictional recovery continuation.
- Intern visit list, authorized inspection, similar structured case references, request status and recovery controls.
- Manager service incidents, scoped report candidates, health observations, delivery mode and aggregate event analytics.
- Supplementary catalog workspace, preset draft changes, independent review, explicit manager publication, revision history and restore as a new draft.
- Structured case proposals separate from catalog publication.

The workbench's server binds to loopback on its own port, uses exact host/origin checks, a per-process browser request token, allowlisted assets and bounded requests. It is not an internet-facing auth system. Persona selection is deliberate simulation, never a real identity assertion.

By default the workspace is in memory. An explicit persistent-demo option stores synthetic catalog, delivery metadata and aggregate counts in an ignored local data directory. The student's diagnostic visit remains transient. The synthetic destination is memory-only, so unresolved ledger operations from a prior process may remain unknown; do not treat missing simulated state as definite failure. Optional model providers remain disabled here.

## Development status

Feature code only. No syntax execution, automated test runs, browser testing, deployment, provider calls or workstation changes performed. Existing regression files are preserved, automatic CI is manual-only. This environment must be validated later before any real integration. The real application's catalog, identity, permissions, support delivery and session lifecycle remain authoritative.
