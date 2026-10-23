# Spec Delta

## Purpose

Lets players piece together rival activity from rumors and clues with explicit uncertainty, then choose to investigate, negotiate, reinforce, or strike.

## ADDED Requirements

### Requirement: Intel carries confidence

Every Black Book entry SHALL carry confidence (rumor, likely, confirmed), source kind (contact, scout, faction warning), and age, and SHALL never present inferred strength as exact.

#### Scenario: Rumor stays a rumor
- **WHEN** a rumor of reduced rival defenses exists from a single contact
- **THEN** the entry shows rumor confidence and a range, not an exact defense number

### Requirement: Players act on intel

Each entry SHALL offer next actions that deep-link to existing flows: investigate, negotiate, reinforce defenses, or strike.

#### Scenario: Reinforce from intel
- **WHEN** a player chooses reinforce on a territory threat
- **THEN** they land on the correct turf defense flow with the district preselected

### Requirement: Intel expires and upgrades

Entries SHALL expire after their validity window and SHALL upgrade confidence when corroborated by an independent source.

#### Scenario: Corroboration upgrades
- **WHEN** a scout report corroborates a contact rumor for the same target
- **THEN** confidence rises one level and both sources are listed
