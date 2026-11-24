# Private catalog mapping and coverage review — 0.13

This module helps an authorized knowledge reviewer prepare the supplementary engine's private mapping against the existing live published catalog. It is not a catalog importer, automatic guide generator or publication mechanism. No actual university catalog, mapping, or result is bundled or executed here.

The purpose registry describes the intended guide destinations used by the diagnostic rules, separate from guide IDs and actual procedures. The report reuses the same native projection and eligibility rules as the embedded bridge. It distinguishes:
- native routes (by default exam and directory, which remain handled by the original app);
- out-of-scope or currently unavailable services;
- missing service or guide mappings;
- withheld native guides and reasons;
- unconditional and conditional mapped purposes;
- potentially overlapping equal-specificity prerequisites;
- unknown mapping purposes and missing native guide references.

These are metadata coverage indicators, not runtime validation, resolution rates or a claim that the institution lacks a guide. A potentially overlapping pair may be disambiguated by a more specific third guide; a mapped purpose does not prove that the correct diagnostic path reaches it. Conditional prerequisites that are not among the engine's safe automatically askable context fields are listed for the reviewer.

Optional candidate suggestions use only currently eligible, reviewed, bilingual, uniquely owned and unmapped native guide metadata in the relevant service. They are lexical review leads, never approvals or permission to display steps. Reviewers must inspect the actual native procedure, prerequisites, warnings, ownership and audience independently. Disabled, staff-only, entry-menu, ambiguous ownership and unreviewed guides are excluded.

The mapping draft function accepts bounded, explicit changes to guide-purpose rows and a current expected catalog revision. It reuses native eligibility checks to refuse new/replaced mappings that would be unavailable. It returns a candidate mapping for independent review; it never writes a file, applies a patch, changes a card, approves or publishes anything. The native application remains authoritative, and a private approval and activation workflow must enforce revision checks at publication time.

The authorized review wrapper accepts only native staff roles and independently checks the permission before reading the catalog and again before returning the report. Keep all outputs private. Do not expose this report to the student controller, copy mapping rows to this public repository or send them to an external model.

No coverage audit against the live/private catalog, tests, builds, syntax checks, deployments or provider calls were performed for this milestone. The next private integration step is to wire the authorization/review hooks, use current published content, review mapping candidates and separately validate the integrated behavior when authorized.
