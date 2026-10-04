# Law audit — 1.3.0

An end-to-end check of the 1.3.0 law system (the Case, warrants, lawyers, officials, informants, the
Feds, and Ledger's Jobs and feats) against [ROADMAP-1.3.0.md](ROADMAP-1.3.0.md), done for 1.3.0-G on
`classic-og-v1.3-g`.

## How it was checked

- **Balance:** `npm run qa:law` (new in G) plays whole 28-day rounds of street work through the real
  engine maths: work-supply Heat, busts and arrests, Case from Heat, direct evidence, city pace,
  cooling and warrants. It covers careful, managed, trading and reckless players on casual, regular
  and grinder schedules, in three cities, 200 rounds each.
- **Integrity:** every stored Case should equal the sum of its receipts. The warrant, official and
  federal suites now check this after every test, through serves, lawyer-ups, quashes, stings and
  relocations. The new Admin → Law page runs the same check over a whole round.
- **Privacy:** read every route, feed, notification, profile and public result that touches the law,
  looking for anything that reveals one player's Case to another.
- **Exploits:** walked each of the attempts below against the code and the integration suites.
- **Mobile:** ran the UI audit (`npm run qa:ui`) on Admin → Law, Jobs and Profile at 360 px, 390 px and
  desktop width. Also screenshotted the dashboard's Case panel and the admin player Case page at 390 px.

## Fixed in G

### 1. The first-pass numbers made warrants routine

`qa:law` on `classic-og-v1.3-f`, warrants per round:

| Player | First pass (F) | Pinned (G) | Goal |
| --- | --- | --- | --- |
| Careful, regular hours | 5–9 | 0 | at most 1–2 |
| Careful, grinder hours | 6–11 | 0 | at most 1–2 |
| Managed (heavy product under the bust line) | 11–19 | 0 | at most 3 |
| Reckless, regular hours | 28–41 | 3.5–8.5 | roughly weekly |
| Reckless, grinder hours | 34–45 | 6–11.4 | at least weekly |

A Case only cooled after a full day without evidence, which an active player never has. Busts also
added as much as a day of reckless Heat each. `classic-og-v1.3-g` scales the Case to real Heat
volumes:

- **Heat to Case:** 0.005 (was 0.1).
- **Evidence:** bust 1, arrest 3, road stop 1, torch 3, sack 3, hijack 2.
- **Currency reports:** 2 points per $1,000,000 (was 4 per $250,000). An engaged player moves
  millions a day by the late game.
- **Cooling:** starts after 6 quiet hours (a night's sleep) at 0.5 an hour.
- **Laundering:** washes 0.02 per point of Heat, up to 3 a day.
- **Served warrant:** drops the Case to 20 (Noticed).
- **Federal sweep:** writes 5.

Stages, warrants, lawyers, officials, informants and city pace are unchanged. The bands in the table
are part of the release gate. The Beverly Hills and Atlanta bands scale with each city's pace.

### 2. Two clean-record feats would have been free

At G's numbers a careful player's Case never passes Noticed, so "no Case reaching Warrant" and "never
past Noticed" would come with ordinary play. Nothing on Paper now needs no Case ever reaching Under
Investigation, and Off the Books needs every Case to stay Quiet. No law season has finished yet, so
nobody loses a feat.

### 3. Admin list links were small on phones

The player links in Admin → Law's lists were 20 px tall. They are now at least 28 px.

## Checked and holding

| Attempt | Result |
| --- | --- |
| Retry an action to add evidence twice | ✅ Every receipt is keyed on its source act. The quest signal from cooling is keyed on the city, time and stages. |
| A Case that no longer adds up to its receipts | ✅ None across the warrant, official and federal suites. Admin → Law flags any that appear. |
| Read another player's Case | ✅ Only `/game/law` (your own) and staff routes return a Case. Cooling Jobs signals are never activities. Law feats only judge finished seasons and show no live progress. Sweep results and informant tips carry nothing about anyone's Case. |
| Add evidence to someone else's Case | ✅ No route takes another player as the target. |
| Relocate to outrun a federal warrant | ✅ The warrant follows with a fresh window. Moves have a 24-hour cooldown and 6 hours on the road and cost 5% of net worth, so one move gains at most about 12 hours, once a day. |
| Relocate to leave a local warrant behind | ⚠️ By design: below Federal the Case stays behind, and a personal warrant waits there for the boss. It costs a move, and the Case is still there on return. |
| Split cash across cities to dodge currency reports | ⚠️ By design: reports are per city, per UTC day. Splitting means really moving the cash through other cities. |
| Fire and rehire an official to reset exposure | ✅ 48-hour rehire cooldown after a cut or a sting. |
| Launder a Case away | ✅ Capped per player per UTC day (3 points in G). |
| Two days of police losses around UTC midnight | ⚠️ By design: the cap is per UTC day, so a raid just before and one just after midnight can both reach the cap. |
| Farm Ledger's Jobs | ✅ One-time Jobs that pay standing and cosmetics only. |
| Staff correcting their own Case | ✅ Refused. Every correction is audited with a reason, writes a receipt the player sees, and never drafts a warrant, sends a stage alert or advances a Job. |

## Mobile

| Page | Overflow | axe WCAG 2.2 AA | Script errors | Targets under 24 px |
| --- | --- | --- | --- | --- |
| Admin → Law | none | no violations | none | XP bar only (shared by every page) |
| Jobs (Ledger) | none | no violations | none | XP bar only |
| Profile (Law feats) | none | no violations | none | XP bar only |
| Dashboard Case panel, admin player Case page (390 px screenshots) | none | — | — | — |

## Still open

- `qa:law` models street work, the main Heat source. Runs, production and rackets add Case on top in a
  real round, which is what the sensible bands' headroom is for.
- A staff correction doesn't restart a Case's quiet clock, so a Case set by staff starts cooling at
  once.
- The trip screen's airport-check preview does not show Customs' cut yet (from D).
