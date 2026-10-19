# Career Storylines 2.4.0 — Rollout and Rollback

Career storylines are enabled by the pinned round capability:

```json
{ "careerStorylines": { "enabled": true, "catalogVersion": "2.4.0-A" } }
```

The server loads a story only when both `enabled` is true and the catalog
version matches. Existing career identity history remains readable when the
capability is absent or disabled.

## Staged rollout

1. Enable the capability for an internal ruleset and verify catalog parity,
   source retries, pause/expiry, privacy, and reward budgets.
2. Enable it for a beta round while monitoring story instance creation,
   duplicate source claims, choice conflicts, and portfolio visibility.
3. Expand to the intended 2.4 round after focused integration and UI checks.

## Rollback

Set `careerStorylines.enabled` to `false` in the next pinned round ruleset.
New story reads and progression stop; existing persisted portfolio records are
not deleted and remain available to owner/public visibility rules. Do not
rewrite `PlayerCareer` history or synthesize story progress during rollback.
