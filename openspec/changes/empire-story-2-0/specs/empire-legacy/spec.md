# Spec Delta

## Purpose

Gives seasonal players a lasting, non-pay-to-win identity by preserving famous battles, covers, honors, and rivalries across resets.

## ADDED Requirements

### Requirement: Legacy entries are snapshotted at round end

The system SHALL snapshot qualifying accomplishments (top finishes, major victories, Daily covers, decorated crew, rivalries) into read-only LegacyEntry rows owned by the account.

#### Scenario: Winner keeps proof
- **WHEN** a round ends with a qualifying victory
- **THEN** a LegacyEntry with season, title, summary, and links exists for that account after reset

### Requirement: Legacy grants no power

LegacyEntry rows SHALL confer no cash, stats, unlocks, or matchmaking advantage, and SHALL be excluded from round-start logic.

#### Scenario: Fresh start stays fresh
- **WHEN** a new round starts for an account with legacy entries
- **THEN** starting cash, crew, and unlocks are identical to an account with none

### Requirement: Legacy is viewable and showcaseable

Accounts SHALL be able to view their gallery and feature selected entries on their profile.

#### Scenario: Feature a victory
- **WHEN** a player features a legacy entry
- **THEN** visitors to their profile see it in the showcase slot
