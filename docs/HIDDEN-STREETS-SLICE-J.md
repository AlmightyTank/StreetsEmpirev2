# Hidden Streets — Slice J: Dangerous Encounters

Status: implemented in ruleset `classic-og-v1.8-s` (`1.8.0-S`).

## Content keys

- `combat-five-names` → `SECRET_FIVE_NAMES` (`DANGEROUS`). Milestone: `verify_names`.
- `travel-extraction-cache` → `SECRET_EXTRACTION_REQUIRED` (`DANGEROUS`). Milestone: `clean_extracts`. Reward includes `extraction-badge`.

## Risk rules

The extraction encounter communicates risk in the encounter text and uses existing bounded random-encounter effects. There are no hidden turn/cash drains outside the normal encounter settlement receipt.

## Duplicate protection

Retries cannot duplicate permanent rewards because quest claim runs through `QUEST_CLAIM:<questKey>` and cosmetics are upserted by `(accountId,key)`.
