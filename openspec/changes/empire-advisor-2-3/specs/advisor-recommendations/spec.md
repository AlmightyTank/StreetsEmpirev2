# Spec Delta

## Purpose

Defines the deterministic rules that turn an advisor snapshot into at most one urgent suggestion and two growth suggestions, each actionable or explicitly informational.

## ADDED Requirements

### Requirement: Recommendations are reproducible

The engine SHALL be a pure function of the advisor snapshot, ruleset version, planning focus, suppression set, and server time, and SHALL NOT call a generative model.

#### Scenario: Same snapshot, same cards

- **WHEN** the engine ranks the same snapshot twice with the same ruleset, focus, suppressions, and time
- **THEN** it returns the same suggestion keys in the same order

#### Scenario: Ruleset drift drops disabled systems

- **WHEN** the same player facts are evaluated under a ruleset that disables holdings
- **THEN** no holdings suggestion is returned
- **AND** suggestions that remain still match the rules enabled for that ruleset

### Requirement: Priority fills one urgent slot and two growth slots

The engine SHALL return at most one urgent suggestion and at most two growth suggestions, in that order, and SHALL treat an empty result as valid.

#### Scenario: More candidates than slots

- **WHEN** blocked progress, a ready claim, a supply shortfall, an affordable holding, and an available contract are all eligible
- **THEN** the briefing contains at most three suggestions
- **AND** the urgent suggestion is the blocked-progress or ready-claim item according to the fixed priority
- **AND** remaining growth slots prefer supply shortfalls, then safe investments, then available contracts

#### Scenario: Nothing to suggest

- **WHEN** no candidate passes eligibility
- **THEN** the briefing contains no suggestions
- **AND** the engine does not invent a filler action

### Requirement: Every suggestion is eligible or labeled informational

An actionable suggestion SHALL pass the same ownership, round, pause, ruleset, and status gates as the destination action. A suggestion that must not be performed now SHALL be labeled informational and SHALL NOT be presented as that action.

#### Scenario: Closed quest is not recommended

- **WHEN** a quest is completed, failed, or expired
- **THEN** it is not returned as an actionable suggestion

#### Scenario: Paused round does not offer a turn action

- **WHEN** the round is paused or the player has no turns and the candidate action requires a running round or a turn
- **THEN** that action is not returned as actionable
- **AND** any card that explains the block is labeled informational
- **AND** the informational card counts toward the three-card cap

#### Scenario: Unauthorized target is excluded

- **WHEN** a candidate would act on a holding, district, quest, or crew the player does not own or cannot legally use
- **THEN** the engine omits it
