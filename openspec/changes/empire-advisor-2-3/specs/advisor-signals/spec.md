# Spec Delta

## Purpose

Defines the owner-only facts the Adaptive Empire Advisor may read, and the plain-language reasons it may show, so a suggestion cannot infer private enemy data.

## ADDED Requirements

### Requirement: Advisor signals are an owner-only allowlist

The server SHALL build each advisor snapshot only from the signed-in player's own cash, turns, crew state, Heat, verified quest status, stock, and city holdings, plus round pause and the ruleset flags that enable those systems.

#### Scenario: Enemy intel is not a signal

- **WHEN** the advisor snapshot is assembled for a player who has scout reports, combat recon, or Black Book rival entries available elsewhere
- **THEN** the snapshot contains none of those rival facts
- **AND** no suggestion reason is derived from another player's stock, defenses, or unrevealed location

#### Scenario: Missing systems are absent

- **WHEN** the active ruleset does not include Heat, city holdings, or quests
- **THEN** the snapshot omits that system
- **AND** the omission is explicit so recommendation rules for it do not run

### Requirement: Reasons stay inside the allowlist

Each suggestion SHALL include a plain-language reason produced from a template and the allowlisted snapshot fields.

#### Scenario: Reason uses the player's own state

- **WHEN** a suggestion is shown for low turns or a ready quest claim
- **THEN** the reason names the player's own blocking or ready state
- **AND** the reason does not require a generative model

#### Scenario: Another player's identity stays out

- **WHEN** a reason is rendered
- **THEN** it does not name another player unless that identity is already present on an activity delivered to the signed-in player

### Requirement: Building a snapshot does not mutate the round

The advisor read SHALL NOT claim quests, grant rewards, settle loans, consume encounters, or start any other gameplay action.

#### Scenario: Dashboard poll stays a read

- **WHEN** a paused or background dashboard read includes the advisor snapshot
- **THEN** the player's cash, turns, inventory, crew, quests, and loans are unchanged by that read
