# Spec Delta

## Purpose

Defines how the advisor records shown, clicked, dismissed, and completed outcomes so usefulness can be measured without private data or a compliance score.

## ADDED Requirements

### Requirement: Outcome events omit private facts

The advisor SHALL record outcome events with the rule id, suggestion key, slot, focus, ruleset version, round id, and outcome, and SHALL NOT store cash amounts, stock quantities, reason text, notification bodies, or enemy identifiers.

#### Scenario: A shown event is safe to export

- **WHEN** a suggestion is recorded as shown
- **THEN** the stored event contains the suggestion key and outcome
- **AND** it does not contain the player's cash, stock, reason string, or another player's identity

### Requirement: Impressions are not inflated by polling

A shown event SHALL be recorded once per suggestion key until that source fingerprint changes.

#### Scenario: Dashboard polling does not multiply shown

- **WHEN** the same suggestion remains eligible across repeated dashboard reads
- **THEN** one shown event is kept for that key
- **AND** a changed source fingerprint may record a new shown event

### Requirement: Completion follows a click

The advisor SHALL record completed only when the linked source settles after the player clicked that suggestion. It SHALL treat dismiss as a player choice, not as a failure to obey.

#### Scenario: Click then settle counts as completed

- **WHEN** a player opens a suggestion and the linked source later settles
- **THEN** one completed event is recorded for that suggestion key

#### Scenario: The same action without the card is not compliance

- **WHEN** a player completes an eligible action without clicking its advisor card
- **THEN** no completed event is recorded for that card

#### Scenario: Not useful is distinct from snooze

- **WHEN** a player dismisses a suggestion as not useful
- **THEN** the outcome is distinguishable from a snooze
- **AND** the player is not penalized in gameplay for that dismissal
