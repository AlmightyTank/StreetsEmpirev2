# 2.1.0-D — Mentors & Crew Bonds

## The player choice
A player can voluntarily connect a proven mentor to a newer member of the **same role**. The veteran must have at least **100 earned crew XP or 25 loyalty**; the apprentice must have less experience, less than 25 loyalty and cannot be released. A mentor can support **two concurrent apprentices**. One apprentice gets **one mentorship link per round**, even if a player later ends it—no reset/relink farming. All links and lessons are round-scoped, account private and end automatically in practice if either career is released (no more receipts).

## Authentic progression, not a chore
Every member already receives an immutable `CrewLoyaltyEntry` on verified work. The second positive receipt from **the same sourceKey and source** for both mentor and apprentice, both dated after link creation, grants **one** shared training memory to their bond. One memory per UTC day, **five total per bond**. Duplicates and retries are prevented by a unique `(bondId,sourceKey)` index and a row lock on the bond. Milestones: 0 New Connection, 1 First Lesson, 3 Finding Their Rhythm, 5 Trusted Partners. These are *narrative titles* only: no extra career XP, combat power, wages, loyalty points, store prices or other balancing changes.

**Paid training never earns bond progress.** Switching crew posts, logging in, opening the roster, receiving a zero-point capped loyalty receipt or ending/restarting bonds also earns no progress. No timed attendance checks or penalties for RNG loss; progress only when members happen to take part in the same real action.

## Provenance, safety, compatibility
The PostgreSQL `CrewMentorBond` and `CrewBondMemory` models belong to the same RoundPlayer and CrewMember records as Slice A; cascade deletes do not resurrect a released or pruned crew member. Links are created/ended through authenticated owner-scoped endpoints under a RoundPlayer transaction lock. Display is restricted to the player's existing crew roster; all active bonds returned first, with a maximum of 100 archived bonds in the response. The UI has a small-screen layout and explicit 'End bond' control.

No new ruleset variant: this optional narrative feature is enabled **only in rounds where crew loyalty is enabled**, and leaves older pinned non-loyalty rounds unchanged. The underlying loyalty/action formulas stay the same.

## Verification
- Validate mentor qualifications, apprentice eligibility, same-owner, same-role, non-self, max two concurrent apprentice slots, once-per-round pairing, and no cycles.
- Validate positive same-action receipts only, post-link provenance, one/day + five lifetime cap, dedupe, and disabled/no-record behavior.
- Database migration, Prisma generate, typechecking, unit tests, public integration and builds; validate UI smoke on beta.
- Narrative balance invariant: the new service only reads existing event/loyalty records and writes its own bond/memory tables, no stat changes.
