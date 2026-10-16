# Spec Delta

## Purpose

Gives players recognizable criminal career fantasies with tailored contracts and cosmetics while keeping one shared core game and balance.

## ADDED Requirements

### Requirement: Careers are cosmetic plus contracts

A career (Enforcer, Smuggler, Fixer, Business Boss, Intelligence Broker) SHALL grant a title, profile mark, and filtered contract list, and SHALL NOT change core action math, caps, or access.

#### Scenario: Same math different jobs
- **WHEN** two players with different careers perform the same raid
- **THEN** results use identical math but each sees career-flavored contracts elsewhere

### Requirement: Career can be changed with cooldown

Players SHALL be able to switch career, with a cooldown and public history entry.

#### Scenario: Switch shows history
- **WHEN** a player switches from Smuggler to Fixer after the cooldown
- **THEN** the new title applies and history shows both careers with dates
