# StreetsEmpire Street Sign Builder

## Product rules

- The sign always looks like a reflective metal street sign. Players choose only **Classic** or **Wide** outlines.
- The sign is a cosmetic crew identity item. It never claims, names, or grants access to a city block.
- Street text and graffiti are plain text. The game owns the layout and rendering; players cannot upload arbitrary artwork or markup.
- Designs are versioned account cosmetics so they survive round changes and remain editable.

## Slices

### Slice A — Core builder and saved design

- [x] Add a versioned street-sign design DTO with server-side validation and safe readback from saved JSON.
- [x] Support Classic and Wide sign shapes with the same metal street-sign finish.
- [x] Add editable street text, street type, graffiti tag, curated font styles, palette colors, and live preview in Account Settings.
- [x] Persist the saved design on the account profile without clearing it when an older client updates other profile settings.
- [x] Block prohibited severe slurs and reject markup or unsupported styles.
- [x] Add schema and account-profile service tests.

**Done when:** a player can build and save either sign shape, refresh settings and see the same design, and invalid shape/font/color/text values cannot be stored or rendered.

### Slice B — Public sign placements

- [x] Show the saved sign on the crew’s public profile and profile hover card, with a compact mobile layout.
- [x] Use server-normalized sign DTOs only; keep empty designs hidden and provide a safe fallback for older profiles.
- [x] Add profile rendering tests for saved, empty, private, and malformed historical values.

**Done when:** saved signs render consistently on both profile surfaces, privacy settings are honored, and older or invalid stored values produce no sign.

### Slice C — Beginner journey integration

- [x] Add “Build Your Street Sign” as the opening Make Your Mark tour step, completed only by a server-normalized saved design.
- [x] Count existing valid saved designs automatically and preserve skip/resume behavior, including already-completed legacy tours.
- [x] Show the saved sign in a dismissible “You’re on the map” recap; keep the sign cosmetic and separate from turf claims.

**Done when:** valid saved signs complete the identity step without a client click, invalid values cannot complete it, and the recap survives refresh until dismissed.

### Slice D — Editor polish

- [x] Add small/medium/large graffiti tags and lower-left/center/right placement presets.
- [x] Add single/double/beveled steel trim, soft/deep/no shadow, and reflective/clean enamel/weathered metal treatments while preserving Classic/Wide shapes and the metal sign material.
- [x] Add a reset-to-saved/preview action and specific save/removal confirmation.
- [x] Improve touch target sizes and narrow-screen field layout; add keyboard focus states, labeled controls, and live contrast guidance.
- [x] Migrate existing v1 sign designs to safe v2 defaults while accepting v1 payloads from older open clients.

**Done when:** every new option updates the preview and saves through the existing validator, old designs still read, and the editor remains operable by keyboard and on phone widths.

### Slice E — Earnable art packs and moderation tools

- [x] Add permanent account-level Sign Painter (level 10) and Graffiti (level 20) packs through the existing cosmetic unlock table and XP milestones.
- [x] Keep Graffiti Script and Wildstyle restricted to graffiti tags; the Sign Painter font can be used for street text and tags. Enforce ownership on the server as well as in the editor.
- [x] Show pack unlock milestones in XP Progress and locked styles in the builder.
- [x] Add a Report street sign path from public profiles; reports enter the existing staff bug-report review queue with the exact sign and target attached.
- [x] Keep arbitrary image, SVG, and font-file uploads out; only bundled/local type styles can be selected.

**Done when:** earned packs persist across rounds, unearned or slot-incompatible fonts cannot be saved through the API, and players can send public sign content to the existing staff review queue.

### Slice F — Release checks

- [x] Verify account settings re-read the saved sign after refresh, retain it when older profile updates omit the sign, and retain it when the active round changes.
- [x] Run focused sign-builder, account-profile, XP-pack, and progression tests; run repository typecheck and production build.
- [x] Run the UI style drift guard; allowlist the sign artwork surface and semantic/accent-token declarations it correctly identifies.
- [x] Document the rollout and rollback path in `docs/STREET-SIGN-BUILDER-RELEASE.md`.
- [ ] Run the authenticated desktop/mobile browser visual and axe matrix against the beta API before public rollout.

**Done when:** automated checks pass, the authenticated desktop/mobile browser matrix is reviewed, and rollback can disable the feature without data loss.

### Slice G — Sign backdrops

- [x] Bump the saved design to v3 with a `backdrop` key; v1 and v2 designs (saved or from open tabs) read as `plain`.
- [x] Add one printed backdrop per Drop collection (`STREET_SIGN_BACKDROPS` in `@streets/shared`), unlocked by owning that collection's shell theme, alone or in its bundle. These are never sold separately.
- [x] Sell backdrops with no shell theme as Street Singles on The Drop (`STREET_SIGN_BACKDROP` kind, `SIGN` preview): Downtown, New York, Chicago, Las Vegas, Miami Beach, Seattle and San Francisco skylines, plus the Gun Stockpile.
- [x] Add game-subject singles drawn from areas of the game: Back Alley Dice, Royal Flush, Roulette Wheel and Finish Line (Casino), Cash Stack, Black Book, Loan Shark, Police Lights, Turf Map, Getaway Route and Grow House.
- [x] Enforce ownership on the server (`options.streetSignBackdrops` lists owned keys); show locked backdrops in the picker with where to get them.
- [x] Server tests pair every shell with exactly one backdrop and every sold backdrop with its Drop item; a shared test keeps every default palette at readable contrast.

The art is CSS only (`street-sign-backdrops.css`): gradients for the collection prints and inline SVG silhouettes for the skylines and stockpile. No uploads, the same as the rest of the builder. Local code/release checks are complete; authenticated beta-browser sign-off remains a deployment check because it requires the beta runtime and a player session.
