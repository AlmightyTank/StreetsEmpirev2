# Spec Delta

## Purpose

Defines how players quiet the advisor, how the guided tour takes priority, and how the briefing avoids repeating notifications and Street Reports.

## ADDED Requirements

### Requirement: Players can snooze, dismiss, or silence advice

The advisor SHALL let a player snooze one suggestion, dismiss one suggestion for the round, or silence the whole briefing, and those choices SHALL persist for that account.

#### Scenario: Snooze hides a suggestion until the cooldown ends

- **WHEN** a player snoozes a suggestion
- **THEN** that suggestion key stays out of the briefing until 24 hours of server time have passed
- **AND** rewording the reason does not create a new visible key for the same rule and source

#### Scenario: Dismiss lasts the round

- **WHEN** a player dismisses a suggestion
- **THEN** that suggestion key stays hidden for the rest of the round
- **AND** the hidden key is still suppressed on the player's other devices

#### Scenario: Silence clears the briefing

- **WHEN** a player silences the advisor
- **THEN** the dashboard shows no advisor cards
- **AND** the player can turn the advisor back on
- **AND** combat alerts, pending encounter choices, and Street Report delivery continue

### Requirement: The guided tour outranks the advisor

The advisor SHALL stay quiet while the active tour overlay is showing, and SHALL NOT compete with an unfinished tour.

#### Scenario: Active tour overlay

- **WHEN** the guided tour overlay is the current step
- **THEN** the advisor briefing is empty

#### Scenario: Tour still incomplete

- **WHEN** the tour is incomplete and the overlay is closed
- **THEN** ordinary urgent and growth suggestions are omitted
- **AND** at most one informational card may point at the current tour step

### Requirement: Advisor headlines do not repeat the bell or Street Report

The advisor SHALL NOT repeat a headline whose source id is already on an unread in-app notification or a Street Report announcement for that player.

#### Scenario: Street Report already carries the item

- **WHEN** an unread Street Report announcement cites the same source id as a candidate headline
- **THEN** the advisor omits that headline
- **AND** the Street Report and notification remain available
- **AND** a different eligible next action from the player's own state may still appear
