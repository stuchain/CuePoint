# Architecture Decision Records (UI overhaul)

This folder holds **ADRs** for the Electron + Python engine migration. The **working list** lives in [phase-0-architecture.md](../phase-0-architecture.md#adrs-stubs--fill-during-implementation).

When an ADR is promoted from “Proposed” to “Accepted”, add a file:

`NNNN-title.md` using this template:

```markdown
# ADR-NNNN: Title

## Status
Proposed | Accepted | Superseded

## Context
What forces the decision.

## Decision
What we chose.

## Consequences
Positive and negative outcomes.
```

Suggested first commits:

- `docs(adr): add adr template for ui overhaul`
- `docs(adr): accept adr-001 electron shell decision` (when ready)

## ADR quality bar (analytical)

Each ADR SHOULD quantify **when superseded**: list **signals** (e.g. “Electron bundle size > X MB sustained for two releases”). Link to **Phase 0** drivers if tradeoff touches correctness, security, or parity.
