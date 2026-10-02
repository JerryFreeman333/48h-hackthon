# Shared Foundation

Contract version: 1.0.0. Module documents dated 2026-10-02 are the implementation baseline.

## Branches and ownership

- `main`: project configuration, shared contracts/runtime/UI, integration documentation. No A/B/C business implementation.
- `work/b-research`: B business implementation and thin Next.js route bindings.
- A and C developers create their own branches from main. Merge only reviewed module changes.
- Each module owns its business pages, APIs, logic and tests. Public package changes require coordination.

## Directory and route conventions

`packages/contracts` owns all four schemas and fixtures; `packages/runtime` owns common interfaces; `packages/ui` owns reusable primitives.
`modules/a-profile`, `modules/b-research`, `modules/c-report` own business implementations. Do not read another module's private database.
Next.js files under `app` are thin route bindings. A owns `/profile`, `/demo/a`, `/api/a`; B owns `/research`, `/demo/b`, `/api/b`; C owns `/reports`, `/demo/c`, `/api/c`.

## Data flow

A exports UserProfile + SearchIntent. B consumes SearchIntent and exports CandidateBundle. C consumes UserProfile + CandidateBundle with intentContext. The integration layer retains the SearchIntent snapshot and checks project, mode, profile revision and intent revision before invoking C. JSON export must reflect the same immutable snapshot displayed on screen.

`validateIntegration` is a boundary validator, not a matching engine. Reference validation detects missing/cross-subject evidence but does not prove semantic support. No unknown data is promoted to safe/verified.

## Runtime implementation status

IdentityProvider, SnapshotRepository and DurableScheduler are interfaces only, not working auth/database/worker adapters. Missing identity fails closed with 503; unauthenticated 401; another owner's project 403. Do not trust client-supplied user IDs or paid flags.

Storage target is PostgreSQL. Shared project/user ownership belongs to runtime; module tables remain module-owned. Implement project-scoped reads and immutable snapshots. No SQL migration is fabricated before auth and storage adapters are selected.

CallBudget enforces call and known upper-cost limits deterministically. Unknown cost is not zero and must block paid calls without a known ceiling. Usage remains recorded after cancellation; fixed subscriptions are allocated by the shared cost layer, not counted again per API request.

No model client, external fetcher, durable scheduler, database adapter, login flow or payment flow is connected yet. Do not create one per module. No real provider falls back to demo.

## Ownership register

| Capability | Initial maintainer | State |
| --- | --- | --- |
| Contracts / fixtures / integration | Current shared foundation work | Initial implementation |
| Industry and role taxonomy | A developer | Not implemented; B reuses A IDs |
| Auth / project context | Shared runtime owner to confirm | Interface only |
| Database / migrations | Shared runtime owner to confirm | Interface only |
| Durable scheduler / logs | Shared runtime owner to confirm | Interface only |
| Model client / provider configuration | Shared runtime owner to confirm | Not connected |
| B research | B developer | Separate prototype branch |
| C matching and report | C developer | Not implemented here |

## Integration acceptance

Run shared tests and typecheck before merging. Verify changed profile versions, old intent rejection, ambiguous entities, empty candidates, failed suppliers, unsupported citations, unknown salary, private evidence isolation and export consistency. Synthetic fixture tests demonstrate interoperability only, not accuracy with real companies.
