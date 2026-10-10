# CartDE documentation

| Document | Purpose |
| --- | --- |
| [PRD.md](PRD.md) | Product requirements: problem, goals, personas, journeys, prioritised requirements, milestones, risks |
| [SRS.md](SRS.md) | Software requirements: verified stack, architecture, data model, numbered functional and non-functional requirements, order state model, interfaces, verification |
| [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) | Repository audit of 2026-10-10, working agreements, architecture decisions, Milestone 0.1 task list, milestones 0.2 to 0.6, CI, deployment, risks, owner decisions |
| [architecture.md](architecture.md), [development.md](development.md), [deployment.md](deployment.md) | How the code is organised, how to work on it, how to deploy, back up and recover |
| [ai-tools.md](ai-tools.md) | The nine MCP tools, how to connect a client, and the safety design |
| [extensions.md](extensions.md) | Themes, languages, search, and the extension API |
| [traceability.md](traceability.md) | Every PRD and SRS requirement: where it is implemented, how it is verified, what is open |

Status on 2026-10-10 (end of day): milestones 0.1 to 0.6 are built, deployed and open on https://cartde.heymehedi.workers.dev. 221 unit tests and 17 browser tests (including accessibility and a real MCP client) pass. [traceability.md](traceability.md) lists every requirement and its evidence. Still open: publishing the GitHub repository and testing the deploy button from a clean account, choosing the Workers Paid plan (CPU measurements exceed the free plan), route caching for the p95 target, a native-speaker review of the Bengali text, and one order from a physical phone.
