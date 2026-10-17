# StreetsEmpire 2.1.0-E — Nicknames & Legends

## Player-facing system

Players earn one of five curated, non-editable nicknames via server-verified positive Crew Loyalty receipts: **Corner Keeper** (3 held defenses), **Road Veteran** (3 completed trips), **Shift Anchor** (3 sold dealer shifts), **Street Regular** (5 completed jobs), and **Trusted Hand** (50 earned loyalty). The roster reveals the exact supporting threshold; selected nicknames can be switched among earned choices. Catalog-only names prevent offensive free text, and the admin moderation endpoint can suppress a member or archived memento with audited reasons.

### Persistent memorial

Inside the **existing authoritative season-close transaction**, the top **3** members per account with at least **25 earned loyalty**, a qualifying nickname and no moderation suppression are frozen in a **detached** `CrewLegendArchive`. Every record includes the account, source round, source member id (string, no FK to active crew), name, trait, verified nickname proof, earned loyalty/XP, join time, final status, and cutoff time. This is a snapshot, not a transferable member. Retrying close is idempotent by unique (account, round, member); ending/removing the round does not recreate an active member. Archived names are fixed server-generated identities and catalog titles, never player-authored names.

A qualifying account receives the permanent cosmetic collection unlock `crew-legend-memento-v1` (kind CREW_MEMENTO). The memorial art is at `apps/web/public/assets/crew/legend-memento.svg` and appears in **Round Aftermath → My Empire** when that account is signed in. No turns, resources, buffs, carry-over XP, or gameplay influence.

### Security and moderation

- Select endpoint verifies roster ownership and pinned loyalty ruleset, released status, positive immutable receipt counts and moderator suppression. Input accepts only the five enumerated catalog keys or null.
- Dedicated, admin-only audited `POST /admin/crew-legends/moderate` supports `ACTIVE_MEMBER` or `ARCHIVED_LEGEND` suppression, with written reason. Suppressed archives are excluded from player API.
- Private aftermath endpoint `GET /rounds/:roundId/aftermath/crew-legends/me` is authenticated, owner-filtered and `Cache-Control: private, no-store`; history is capped to 100 records.
- A round's `CrewMember` remains roster-count-driven; archives do not have a member or round foreign key and cannot rehydrate a live member. Existing rulesets not using Crew Loyalty are untouched.
- Cosmetic art has no dynamic person name baked into the SVG so moderated titles cannot be copied into static assets.

### Verification

Tests cover all earned-key thresholds, zero-point exclusions, suppression, archived snapshot immutability and idempotent account cosmetic unlock. CI: migration, typecheck, unit suite, release integration and UI audit. Manual beta checks: choose nickname, admin suppress/unsuppress, early/automatic round close, revisit My Empire and verify no permanent power.
