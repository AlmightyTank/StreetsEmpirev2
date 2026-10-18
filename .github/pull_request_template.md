## What changed
- 

## Version
<!--
Leave both boxes empty and the deploy bumps the patch number (2.1.0 becomes 2.1.1).
Check minor when this pull request installs a new feature (2.1.4 becomes 2.2.0).
Check major when this pull request finishes the current major line (2.8.3 becomes 3.0.0).
Write "none" on its own line when this pull request should not move the version.
-->
- [ ] minor
- [ ] major

## Patch notes
<!--
Player-facing bullets for the in-game news post. After this deploys, they wait in
Admin → News for review before players, Discord or the forum see them.
Write "none" for changes players won't notice (tests, CI, refactors, docs).
-->
- 

## Design consistency
<!-- Check what you verified. Use N/A only when the PR cannot affect player-facing UI. -->
- [ ] Uses shared tokens/components; any custom art or semantic-color exception is documented
- [ ] Default and non-default accent/theme states reviewed
- [ ] Phone (390px) and desktop (1440px) reviewed; no clipping, overflow, blocked actions, or scroll regression
- [ ] Keyboard focus, accessible names, contrast, touch targets, and reduced motion reviewed
- [ ] Loading, disabled, success, warning, and error states reviewed where relevant
- [ ] Before/after screenshots attached for visual changes, or N/A with reason:
- [ ] `npm run qa:ui:styles` and relevant typecheck/tests passed
