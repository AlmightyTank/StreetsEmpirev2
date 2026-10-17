# Spec Delta

## Purpose

Defines the optional planning focus that lets a player bias suggestions toward money, territory, crew readiness, or quests without changing game rules or acting for them.

## ADDED Requirements

### Requirement: Focus is a saved lens

The advisor SHALL support balanced, money, territory, crew, and quests focuses, SHALL default to balanced, and SHALL persist the choice on the account.

#### Scenario: Focus survives a new session

- **WHEN** a player selects the quests focus and later opens the dashboard again
- **THEN** the briefing still uses the quests focus
- **AND** cash, turns, inventory, crew, Heat, and quest status are unchanged by saving that choice

### Requirement: Focus filters and does not act

A non-balanced focus SHALL only drop out-of-focus suggestions and break ties. It SHALL NOT spend cash, attack, claim, travel, train, or otherwise perform an action.

#### Scenario: Quests focus stays on quests

- **WHEN** the quests focus is selected and both a ready claim and an attack candidate exist
- **THEN** the briefing may include the ready claim
- **AND** it does not include the attack
- **AND** no quest is claimed by selecting the focus

#### Scenario: Money focus does not spend

- **WHEN** the money focus is selected and an affordable holding is suggested
- **THEN** the card links to the existing holding flow
- **AND** no purchase is submitted by selecting the focus or by rendering the card

### Requirement: Focus keeps the briefing contract

Every focus SHALL use the same eligibility gates, suppression rules, and maximum of one urgent plus two growth suggestions.

#### Scenario: Focus cannot exceed the cap

- **WHEN** many in-focus candidates are eligible
- **THEN** the briefing still contains at most three suggestions
- **AND** ineligible or suppressed candidates stay omitted

### Requirement: Money focus does not forecast

The money focus SHALL use current permitted cash, stock, supply, and holdings state, and SHALL NOT present a future price or an automated trade.

#### Scenario: No invented profit forecast

- **WHEN** the money focus ranks suggestions
- **THEN** reasons describe the player's current state
- **AND** no suggestion promises a future market price or executes a trade
