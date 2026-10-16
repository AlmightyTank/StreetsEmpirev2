# Spec Delta

## Purpose

Durable, queryable memory of what players did to districts, businesses, and factions so banners, attitudes, and pressure react consistently.

## ADDED Requirements

### Requirement: City memory events are emitted

The system SHALL emit a CityMemoryEvent for district takeovers, block-war wins, business ownership flips, and crackdown state changes, containing round, city, kind, actors, and summary data.

#### Scenario: Takeover emits event
- **WHEN** a turf takeover settles with a new owner
- **THEN** one CityMemoryEvent with kind takeover, winner, loser, and block list exists and is queryable by round and city

#### Scenario: No duplicate on retry
- **WHEN** the same settle is retried with the same idempotency key
- **THEN** no second event is created

### Requirement: Consumers read memory, not source tables

District banners, faction attitudes, and heat modifiers that reflect player history SHALL derive from CityMemoryEvent rather than re-querying turf or war tables directly.

#### Scenario: Banner reflects latest takeover
- **WHEN** a district has two takeovers in one season
- **THEN** the banner shows the latest winner from memory events

### Requirement: Memory is season-scoped and visible by rule

CityMemoryEvent rows SHALL be scoped to a round and carry visibility (public, involved-only) enforced on read.

#### Scenario: Private flip stays private
- **WHEN** an event is marked involved-only
- **THEN** uninvolved players cannot list it but participants can
