# Street Sign Builder release guide

## Release contents

Slices A–F add an account-saved metal street-sign design with Classic and Wide silhouettes, text and graffiti styling, earnable bundled font packs, public profile display, a report path, and editor accessibility/responsive improvements. The design is stored in the existing account profile JSON field. Font-pack ownership uses the existing account cosmetic unlock table. This feature adds no database migration, upload path, or round-owned state.

## Checks run for Slice F

- Full unit suite: 423 files passed; 2,917 tests passed and 3 were skipped.
- Targeted sign-builder, account-profile service, and progression tests: 45 tests passed, including save/read after refresh, older profile-update preservation, round change, font-pack ownership, and editor accessibility semantics.
- Repository TypeScript typecheck.
- Production build for server, game client, public site, and Discord bot.
- UI style drift guard.
- `git diff --check`.

The authenticated screenshot and axe matrix still needs to run against the beta runtime with a signed-in player. This environment has no available Chromium executable. Run the app and use the UI audit with screenshots at phone, tablet, and desktop widths:

```sh
npm run dev
UI_AUDIT_PLAYER='username:password' npm run qa:ui -- --responsive --strict --shots --only /account --base http://127.0.0.1:5173 --out ./street-sign-ui-audit
```

Review the screenshots for the builder in Account Settings, keyboard focus and contrast, save/reset behavior, font lock states, and overflow at 360/390/768/1440 widths. The `--only /account` audit is authenticated and requires an available local or beta API, a current player account, and the configured browser runtime.

## Rollout

1. Deploy the normal server and web release; no migration or feature flag is required.
2. Verify an account can save a sign, reload Account Settings, and see it on its public profile when profile appearance is visible.
3. Verify an account below levels 10/20 sees the font-pack locks, then verify a level-10/20 account can use the earned fonts. The server remains authoritative for font ownership and slot compatibility.
4. Verify a profile report reaches the existing staff bug-report queue with the sign text and target attached.
5. Complete the authenticated browser visual/axe audit before opening the beta build to the wider player group.

## Rollback

Revert the street-sign feature commits and deploy the previous application build. There is no schema migration to reverse. Existing sign JSON and cosmetic unlock rows can remain in place; rollback does not delete player data or alter XP. Account-profile updates from older clients omit the sign field and preserve it, so rolling back the client does not clear saved designs. If the feature is redeployed later, the server's normal read normalization handles the saved versioned design.

Do not delete `STREET_SIGN_FONT_PACK` unlock rows during rollback; they are durable account cosmetics and may be used by later builds.
