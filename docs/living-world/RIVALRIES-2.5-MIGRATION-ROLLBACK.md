# Rivalries 2.5 Migration and Rollback

The rivalry migration is additive. It creates only rivalry enums, tables, indexes, and foreign keys; it does not backfill existing rounds or rewrite combat, turf, block-war, NPC, activity, or economy records.

## Deploy

```text
npx prisma migrate deploy --schema prisma/schema.prisma
```

The local database was reconciled for the historical `20261018151539` name with a no-op compatibility migration. The correctly ordered `20261107000100_admin_living_story_draft_updated_at_no_default` remains the migration that contains the old ALTER operation. The rivalry migration `20261019150000_rivalries_vendettas_2_5` is applied and `prisma migrate status` reports the schema up to date.

## Rollback

Do not delete rivalry rows or reverse the migration in a live round. Disable the round capability/feature flag so no new receipts, contracts, stories, or claims are created. Existing source receipts and history remain readable for audit and archive views. A structural rollback requires a reviewed backup restore and is not part of runtime operations.
