# StreetsEmpire forum styling

A light Flarum theme using the game's charcoal panels, lime actions, crisp borders,
and compact typography. No extension or game deployment is needed.

Verified links between game and forum profiles are separate: see the
[profile link extension install guide](../../integrations/flarum/street-empire-link/README.md).

## Apply

1. Save a copy of your current Appearance settings and any Custom Styles first.
2. In Flarum administration, open **Appearance**. Set **Primary color** to
   `#b6ff3a`, **Secondary color** to `#191d23`, enable **Dark Mode**, and leave
   **Colored Header** off. Save the settings.
3. Open **Custom Styles** (sometimes labelled **Edit Custom CSS**), paste the
   entire contents of [street-empire.css](street-empire.css), and save.
   If you already have custom CSS, review it before combining the two.
4. Paste [custom-header.html](custom-header.html) into **Custom Header** and
   [custom-footer.html](custom-footer.html) into **Custom Footer**, then save.
   These are HTML snippets with their own inline styles; no CSS update is needed
   if you already pasted the theme. Back up existing header/footer HTML first.
5. Refresh the forum. Check the discussion list, login dialog, search dropdown,
   a discussion/reply composer, and the mobile menu.

Suggested welcome text, entered in Flarum's welcome banner settings:

- **Title:** The streets keep talking.
- **Message:** Round news, strategy, crew recruitment, and rival talk. Welcome to the StreetsEmpire community.

The welcome text is a separate setting; CSS does not replace it. The current
forum title can stay as it is.

The header links to the game homepage and directly back to `/game`. The footer
adds Game News, Game Rules, and Game Account. Links open in the same tab and use
the routes defined in `apps/web/src/App.tsx`; logged-out players will reach the
game's login screen for protected pages. These links do not create shared login
between the game and forum. Both snippets wrap on small screens and contain no
scripts or external assets. The header stays in normal document flow so Flarum
can manage its own sticky navigation.

## Alliance recruitment (0.3.0-C)

Alliance leaders can post one recruitment thread each from the game's alliance page.

1. In Flarum administration, open **Tags** and create a **Recruitment** tag. Let
   everyone reply; start-discussion permission is not needed, because the game
   posts as the API user.
2. Find the tag's numeric id (the admin API at `/api/tags` lists it).
3. Set `FORUM_RECRUITMENT_TAG_ID` on the game server. It reuses `FORUM_API_KEY`
   and `FORUM_API_USER_ID` from news mirroring. Recruitment stays off while the
   tag id or key is empty.

Each thread is titled `[TAG] Name is recruiting`, carries the leader's optional
pitch, and links back to the alliance page. If an admin renames the alliance the
title follows; if the alliance disbands the thread is retitled `(disbanded)` and
locked. Locking uses Flarum's bundled **Lock** extension, so keep it enabled. A
forum outage never blocks the game: the leader sees the error and can retry.

## Beta access

Forum groups are optional for private beta categories, but the game title and
Discord role do not come from a forum group. In the beta game `.env`, set:

```dotenv
BETA_TESTER_DISCORD_LINKED=true
DISCORD_ROLE_SYNC_MODE="beta-tester-only"
```

Beta players who sign up and link Discord can select the **Beta Tester** profile
title/badge in the game, and the beta Discord bot mirrors them as the only
managed Discord role: `Beta Tester`.

## Scope and rollback

Colors come from `apps/web/src/styles/theme.css`. The stylesheet uses the CSS
variables and component classes exposed by the live forum on September 13, 2026.
It preserves Flarum's layout, responsive navigation, tag colors, and group badges.
Keep Dark Mode on so extensions that compile their own colors get a dark base.

Validation: previewed the live forum's frontend with this stylesheet locally at
desktop and 390px phone widths, including the login dialog and mobile drawer.
The forum is currently empty, so populated discussions and the authenticated
composer still need a check after installation. The local preview's cross-origin
icon fonts were blocked; the stylesheet does not change the forum's icon fonts.

To undo, restore the previous Custom Styles, Custom Header, Custom Footer, and Appearance settings. No posts,
accounts, or game files are modified by applying this theme.

Flarum supports this workflow in its [official theming documentation](https://docs.flarum.org/themes/).
