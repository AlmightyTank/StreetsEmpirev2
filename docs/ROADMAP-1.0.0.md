# StreetsEmpire v1.0.0 — Launch & Hardening

## Public Release Roadmap

**Target base:** StreetsEmpire v0.9.0  
**Release theme:** Stop adding major systems. Make the game ready to survive real players.

---

## Vision

1.0.0 is not another feature expansion.

The major gameplay foundation is complete.

The purpose of 1.0.0 is to take everything built from 0.1 through 0.9 and turn it into a stable, understandable, secure and maintainable public game.

The question changes from:

> What system should StreetsEmpire have next?

to:

> Can StreetsEmpire reliably run a complete public season?

---

## 1.0 Philosophy

No major new economy.

No new combat system.

No major new progression system.

No new map system.

Anything that can wait until 1.1 waits.

1.0 concentrates on:

- Reliability
- Security
- Balance
- Onboarding
- Administration
- Moderation
- Performance
- Mobile
- Operations
- Full-season testing

---

## Milestone Overview

| Version | Theme | Outcome |
|---|---|---|
| **1.0.0-A** | Launch Infrastructure | Production, beta and public site separated |
| **1.0.0-B** | Onboarding & Help | New players understand the game |
| **1.0.0-C** | Security & Exploit Hardening | Competitive systems resist abuse |
| **1.0.0-D** | Full-Game Balance | All major systems work together |
| **1.0.0-E** | Administration & Moderation | Game can be operated without DB surgery |
| **1.0.0-F** | Reliability & Recovery | Failures are observable and recoverable |
| **1.0.0-G** | Mobile, PWA & UX | Game is comfortable on modern devices |
| **1.0.0-H** | Release Candidate | Complete public-season launch gate |

---

## 1.0.0-A — Launch Infrastructure

### Objective

Separate development, beta and production clearly.

### Web structure

#### Main website

**streetsempire.dev**

Public landing site containing:

- Game overview
- Screenshots
- Current season
- Live statistics
- Hall of Fame
- News
- Updates
- Rules/help
- Community links
- Registration/play link

#### Production game

**play.streetsempire.dev**

The stable public game.

#### Beta game

**beta.streetsempire.dev**

Testing upcoming builds and balance changes.

### Environment separation

Production and beta must not share:

- Database
- Sessions
- Secrets
- Queues
- Uploaded data
- Ruleset state

### Version visibility

Every environment should clearly display:

- Application version
- Ruleset version
- Environment
- Current season

### Done when

Nobody can accidentally mistake beta for production or deploy beta data into the live game.

---

## 1.0.0-B — Onboarding & Player Education

### Objective

A new player should understand StreetsEmpire without reading an external guide.

### First-login flow

Introduce:

1. Turns
2. Scout
3. Crew
4. Supplies
5. Stores
6. Products
7. Combat
8. Travel
9. Turf
10. Hideout
11. Alliance

Do not dump every system on the first screen.

### Early guidance

Add contextual goals such as:

> Scout the streets.

> Recruit your first thug.

> Restock condoms and beer.

> Produce your first product.

> Buy your first weapon.

These are instructional objectives, not mandatory quests.

### Help system

Every major page gets:

- What this page does
- Important terminology
- Key risks
- Link to full rules

### Returning players

Tutorials must be:

- Skippable
- Replayable
- Non-blocking

### Done when

A fresh account can reach normal gameplay without outside assistance.

---

## 1.0.0-C — Security & Exploit Hardening

### Objective

Assume players will deliberately try to break everything involving money, items or competition.

### Test areas

#### Money

- Double spend
- Negative cash
- Integer overflow
- Stale transactions
- Store duplication
- Special-order duplication

#### Inventory

- Negative quantities
- Duplicate purchases
- Duplicate loot
- Concurrent sale
- Outpost transfer duplication

#### Turns

- Double-spending turns
- Refresh exploits
- Concurrent actions
- Turn-generation manipulation

#### Combat

- Replay attacks
- Race-condition revenge
- Protection bypass
- Invalid targets
- Same-account farming

#### Turf

- Double ownership
- Reinforcement races
- Capture duplication
- Supply duplication
- Multi-account tax farming

#### Travel

- Cargo duplication
- Run duplication
- Duplicate arrival
- Convoy settlement races

### Account abuse

Continue strengthening detection around:

- Linked accounts
- Multi-account farming
- Self-feeding alliances
- Trade manipulation
- Automated spam
- API abuse

### Done when

No known supported request pattern creates money, inventory or competitive advantage from nothing.

---

## 1.0.0-D — Whole-Game Balance

### Objective

Stop testing systems only in isolation.

Run full seasons where players use everything.

### Simulated strategies

Include:

- Street-focused
- Product producer
- Trader
- Raider
- Turf holder
- Traveler
- Convoy hunter
- Alliance specialist
- Hideout investor
- Store arbitrage player
- Mixed player

### Questions

- Does any single system dominate net worth?
- Can a player ignore combat entirely?
- Can a player ignore the economy entirely?
- Does controlling turf snowball uncontrollably?
- Can established players permanently lock new players out?
- Are travel profits worth travel risks?
- Are Hideout upgrades worth their cost?
- Can store arbitrage outperform every other activity?
- Do alliances create unbeatable defensive walls?

### Balance goal

There does not need to be perfect equality.

Different strategies should win under different circumstances.

Mixed skilled play should generally outperform blind single-system grinding.

### Done when

At least one complete simulated season passes agreed balance bands.

---

## 1.0.0-E — Administration & Moderation

### Objective

Routine game operations must not require manually editing PostgreSQL.

### Admin functionality

Admins should be able to manage:

#### Seasons

- Schedule
- Start
- Pause where appropriate
- End
- Archive
- Inspect ruleset

#### Accounts

- Search
- Inspect
- Suspend
- Ban
- Mute
- Review moderation history

#### Economy

- Inspect stores
- Inspect markets
- Inspect suspicious transactions
- Inspect shipments

#### Combat

- Inspect reports
- Void clearly broken results where supported
- Review exploit flags

#### Turf

- Inspect blocks
- Inspect ownership history
- Resolve corrupted state

#### Notifications

- Send game-wide announcements
- Schedule maintenance notices

### Audit requirements

Every destructive admin action records:

- Admin
- Action
- Target
- Timestamp
- Reason
- Previous state where practical

### Done when

Normal public administration can be performed from supported tools rather than direct DB edits.

---

## 1.0.0-F — Reliability, Monitoring & Recovery

### Objective

Know when StreetsEmpire breaks and be able to recover it.

### Monitoring

Track:

- API health
- Database health
- Response latency
- Error rates
- Failed actions
- Authentication failures
- Background settlement errors
- Notification failures

### Structured logging

Important events should carry:

- Request ID
- Player ID
- Round ID
- Action ID
- Ruleset
- Error category

Do not log secrets.

### Backups

Establish:

- Automated database backups
- Backup retention
- Off-server backup copy
- Restore procedure

### Restore test

A backup that has never been restored is not a tested backup.

Perform an actual restoration into a non-production environment.

### Deployment recovery

Document:

- Rollback procedure
- Database migration rollback strategy
- Failed-deploy procedure
- Maintenance-mode procedure

### Done when

A server failure is an operational incident rather than a potential permanent loss of the game.

---

## 1.0.0-G — Mobile, PWA, Accessibility & UX

### Objective

Make StreetsEmpire comfortable enough that mobile can be a primary way to play.

### Mobile review

Test every major page at common phone widths.

Focus on:

- Navigation
- Quick Resources
- Tables
- Store checkout
- Combat forms
- Turf blocks
- Travel
- Hideout
- Console
- Admin screens

### PWA

Where practical:

- Installable web app
- App icons
- Push notifications
- Offline shell/error state
- Update notification

Do not pretend gameplay works offline.

### Accessibility

Review:

- Keyboard navigation
- Form labels
- Contrast
- Status indicators
- Touch target size
- Screen-reader semantics
- Error messages

### UX consistency

Standardize:

- Buttons
- Confirmation dialogs
- Receipts
- Warning boxes
- Timers
- Currency formatting
- Quantity controls

### Done when

Important gameplay does not require desktop mode or precision tapping.

---

## 1.0.0-H — Release Candidate & Season One

### Objective

Prove the finished game works before labeling it 1.0.

### Release Candidate

Create a dedicated release candidate build.

No feature work after RC unless required to resolve a release blocker.

### Full regression

Regression includes:

- Registration
- Login
- Turns
- Scout
- Produce
- Stores
- Reputation
- Combat
- Recon
- Recovery
- Alliances
- Products
- Travel
- Convoys
- Turf
- Hideout
- Dynamic economy
- Messaging
- Notifications
- Season ending

### Load test

Test expected public concurrency plus safety margin.

Include:

- Login spikes
- Dashboard polling
- Store purchases
- Scout/Produce
- Mass season ending
- Notification bursts

### Season lifecycle test

Run:

**Create → Join → Play → End → Freeze standings → Hall of Fame → Archive → Create next season**

without manually fixing the database.

### Launch checklist

Before release:

- Production backups verified
- Restore verified
- Admin accounts configured
- Moderation process documented
- Privacy/terms pages prepared
- Rules available
- Status/maintenance mechanism available
- Beta environment separated
- Production secrets rotated
- Release notes published

---

## 1.0 Release Definition

StreetsEmpire 1.0 is ready when a real player can:

> Register → learn the game → build a crew → trade → fight → travel → control turf → build a Hideout → participate in an alliance → interact with players → finish a season → appear in permanent history.

And the operator can run that entire process without manually repairing normal game state.

---

## Explicitly Out of Scope for 1.0

Do **not** delay launch for:

- Businesses and fronts
- Expanded casino gameplay
- Loansharking
- More cities
- New vehicle classes
- Major new product categories
- NPC factions
- Player-owned businesses
- Deep police systems
- New combat modes
- Large crafting systems
- Permanent prestige power
- Native mobile apps

Those belong after launch.

---

## Final 1.0 Rule

**If it isn't required for the existing game to work safely, clearly and reliably, it waits until after 1.0.**

That is what keeps StreetsEmpire from spending forever at version 0.x.
