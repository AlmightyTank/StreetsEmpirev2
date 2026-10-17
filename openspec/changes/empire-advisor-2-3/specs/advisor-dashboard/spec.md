# Spec Delta

## Purpose

Defines the dashboard briefing cards, the existing deep links they use, and how they update without a page reload.

## ADDED Requirements

### Requirement: Dashboard shows a compact briefing

The dashboard SHALL show the advisor briefing as one to three compact cards when suggestions exist, and SHALL NOT add a new primary navigation destination for the advisor.

#### Scenario: Briefing is visible on the dashboard

- **WHEN** the snapshot contains one urgent suggestion and two growth suggestions
- **THEN** the dashboard shows those three cards with a title and the plain-language reason
- **AND** an informational card is labeled as informational

#### Scenario: Empty and silenced states

- **WHEN** the snapshot contains no suggestions, or the advisor is silenced
- **THEN** no action card is shown
- **AND** a silenced briefing still offers a way to turn the advisor back on

### Requirement: Cards open the existing destination

An actionable card SHALL link to an existing game route and focus, including quest focus, turf city and district, holdings, crew, supply, produce, operations, and dashboard section hashes.

#### Scenario: Quest card focuses the quest

- **WHEN** a player activates a ready-claim card on a phone-width viewport
- **THEN** the quest page opens on the matching quest
- **AND** the card does not perform the claim itself

#### Scenario: Turf card selects the district

- **WHEN** a player activates a turf suggestion
- **THEN** the turf page opens with that city and district selected

#### Scenario: Link stays inside the game

- **WHEN** a card href is rendered
- **THEN** it is a same-origin game path
- **AND** it is not an external or script URL

### Requirement: Cards refresh in place

The dashboard SHALL replace the briefing when a new snapshot arrives, without reloading the document.

#### Scenario: Completed action drops the card

- **WHEN** the player completes the linked action and the dashboard snapshot refreshes
- **THEN** a suggestion that is no longer eligible disappears
- **AND** the document is not reloaded

#### Scenario: Dismiss does not navigate

- **WHEN** a player snoozes or dismisses a card
- **THEN** the card is removed from the current dashboard view
- **AND** the player stays on the dashboard

### Requirement: Cards are operable on a phone

Advisor cards SHALL be readable and operable at phone width with keyboard and pointer, including a visible dismiss control that does not depend on hover.

#### Scenario: Phone layout keeps the target clear

- **WHEN** the dashboard is shown at a phone width
- **THEN** each card shows its title, reason, and destination
- **AND** the dismiss control and the link are both reachable without hover
- **AND** reduced motion does not remove either control
