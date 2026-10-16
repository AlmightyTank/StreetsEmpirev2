# Spec Delta

## Purpose

Provides multi-stage, crew-based operations that reuse scouting, crew, vehicles, contacts, and combat to create shareable dramatic moments.

## ADDED Requirements

### Requirement: Operations run in fixed stages

An operation SHALL progress through intel, crew lock, execution, and report stages in order, with validation at each transition.

#### Scenario: Skip prevented
- **WHEN** a player tries to execute before crew lock
- **THEN** the transition is rejected with the missing stage named

### Requirement: Crew specialists matter

Execution odds and unlocked approaches SHALL depend on locked crew roles (driver, enforcer, intel contact) and vehicle availability.

#### Scenario: Missing driver narrows options
- **WHEN** no driver is locked
- **THEN** getaway-dependent approaches are unavailable and odds reflect it

### Requirement: Async co-op is supported

A player SHALL be able to invite another player to fill a role asynchronously, with the operation waiting until accept, decline, or expiry.

#### Scenario: Partner accepts
- **WHEN** an invited player accepts before expiry
- **THEN** they are recorded as participant and execution unlocks if all roles are filled

### Requirement: Every operation ends in an outcome report

On execution the system SHALL produce a persistent outcome report showing per-stage results, what succeeded, what went wrong, and consequences emitted as CityMemoryEvents.

#### Scenario: Report is shareable
- **WHEN** execution completes
- **THEN** a report exists with stage breakdown and both success and failure lines, viewable by participants and linked from Daily when public
