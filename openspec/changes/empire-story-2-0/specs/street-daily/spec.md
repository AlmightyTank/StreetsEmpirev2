# Spec Delta

## Purpose

Turns major player actions into visible, memorable coverage so victories and crackdowns feel like city news, not silent stat changes.

## ADDED Requirements

### Requirement: Daily drafts are generated from memory

The system SHALL generate draft Daily entries from public CityMemoryEvent rows using fixed templates per kind, queued for admin approve, edit, or reject.

#### Scenario: Takeover produces draft
- **WHEN** a public takeover event exists with no draft yet
- **THEN** exactly one draft with headline, summary, and event link is queued within one Daily cycle

#### Scenario: No spam for minor events
- **WHEN** an event is below the coverage threshold
- **THEN** no draft is created

### Requirement: Published coverage is linked and attributable

Published Daily entries SHALL link to involved districts and players and record whether the entry was auto-generated or admin-written.

#### Scenario: Reader follows link
- **WHEN** a player opens a published takeover story
- **THEN** they see the district, winner, loser, and date, plus an auto-generated label when applicable

### Requirement: Street Report surfaces personal impact

Players involved in a covered event SHALL receive a Street Report entry pointing at the Daily story and their personal consequence.

#### Scenario: Loser gets report
- **WHEN** a takeover story publishes
- **THEN** the losing owner has a report entry with reinforce-or-retaliate links
