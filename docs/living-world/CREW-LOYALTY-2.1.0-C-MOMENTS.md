# 2.1.0-C — Crew Personalities & Moments

This slice derives optional narrative moments from existing, authenticated, server-verified crew loyalty receipts and travel-wound career events. The player-controlled `AccountProfile.showCrewMoments` switch defaults to off; when disabled, the server sends an empty moments array. The preference persists across devices and rounds, but the underlying stories remain *round-owned*.

| Moment | Verified trigger |
| --- | --- |
| A Job in the Books | Positive settled JOB_COMPLETED loyalty receipt |
| The Corner Held | Positive DEFENSE_HELD receipt |
| Back from the Road | Positive TRAVEL_COMPLETED receipt |
| Another Shift Settled | Positive DEALER_SHIFT receipt |
| The Road Left a Mark | Recorded UNASSIGNED event on an ESCORT/BODYGUARD return with an explicit wounded marker |

Only one latest receipt per category and at most three moments per member are shown. Descriptions are deterministically styled by the stable existing crew trait, and visibly labeled as *narrative flavor*, never factual dialogue. Capped zero-point receipts, unverified user claims, sign-ins, assignments, swaps and paid training never create moments. No new settlement mutations, bonuses, penalties, RNG, obligation to check in, or changes to older pinned rulesets. Existing 2.1.0-B rounds may opt into this *presentation* feature without changing gameplay.

Verification gates: deterministic/provenance tests, TypeScript, PostgreSQL migration, existing crew tests, visual/accessibility smoke tests, and logged-in beta inspection for enabling/disabling private stories. Persistent account-level cosmetic keepsakes and moderation are deferred to 2.1.0-E.
