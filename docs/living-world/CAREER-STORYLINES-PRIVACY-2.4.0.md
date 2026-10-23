# Career Storylines privacy and source contract

Story source claims are owner- and round-scoped, pinned to the active ruleset, and keyed by a stable settled receipt (`activity:<id>` or an equivalent authoritative source ID). A source can advance one objective at most once.

Allowed projections contain only the source kind, stable source ID, settlement time, objective key, and safe public labels. They never include rival IDs, scout payloads, combat target details, private case evidence, account data, or another player's crew/faction state.

Paused rounds do not advance deadlines or accept new progression. Expired or switched arcs remain readable as archived history and never punish the player or synthesize progress. Public profile and aftermath views expose only earned titles, badges, moments, and redacted chapter status; owner-only details require account ownership.

| Source | Owner-only claim | Public projection |
| --- | --- | --- |
| Scout | Stable settled receipt only | No clue or target payload |
| Combat | Settlement receipt and objective key | No opponent/private combat data |
| Case | Completed case receipt | No evidence or rival/account data |
| Crew/faction | Player-owned relationship receipt | Safe relationship label only |
| Public activity | Activity ID and timestamp | Existing public activity policy |
