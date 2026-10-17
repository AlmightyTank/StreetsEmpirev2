-- The rulesets filed as 3.0.0-A through 3.0.0-I keep the same gameplay.
-- Pinned rows move to 1.9, 2.0, 2.1, and 2.2 so they still resolve.

UPDATE "Round" AS row
SET "rulesetId" = renamed.id, "rulesetVersion" = renamed.version
FROM (VALUES
  ('classic-og-v3.0-a', 'classic-og-v1.9-a', '1.9.0-A'),
  ('classic-og-v3.0-b', 'classic-og-v1.9-b', '1.9.0-B'),
  ('classic-og-v3.0-c', 'classic-og-v1.9-c', '1.9.0-C'),
  ('classic-og-v3.0-d', 'classic-og-v1.9-d', '1.9.0-D'),
  ('classic-og-v3.0-e', 'classic-og-v2.0-a', '2.0.0-A'),
  ('classic-og-v3.0-f', 'classic-og-v2.1-a', '2.1.0-A'),
  ('classic-og-v3.0-g', 'classic-og-v2.1-b', '2.1.0-B'),
  ('classic-og-v3.0-h', 'classic-og-v2.1-c', '2.1.0-C'),
  ('classic-og-v3.0-i', 'classic-og-v2.2-a', '2.2.0-A')
) AS renamed(old_id, id, version)
WHERE row."rulesetId" = renamed.old_id;

UPDATE "QuestDefinition" AS row
SET "rulesetId" = renamed.id, "rulesetVersion" = renamed.version
FROM (VALUES
  ('classic-og-v3.0-a', 'classic-og-v1.9-a', '1.9.0-A'),
  ('classic-og-v3.0-b', 'classic-og-v1.9-b', '1.9.0-B'),
  ('classic-og-v3.0-c', 'classic-og-v1.9-c', '1.9.0-C'),
  ('classic-og-v3.0-d', 'classic-og-v1.9-d', '1.9.0-D'),
  ('classic-og-v3.0-e', 'classic-og-v2.0-a', '2.0.0-A'),
  ('classic-og-v3.0-f', 'classic-og-v2.1-a', '2.1.0-A'),
  ('classic-og-v3.0-g', 'classic-og-v2.1-b', '2.1.0-B'),
  ('classic-og-v3.0-h', 'classic-og-v2.1-c', '2.1.0-C'),
  ('classic-og-v3.0-i', 'classic-og-v2.2-a', '2.2.0-A')
) AS renamed(old_id, id, version)
WHERE row."rulesetId" = renamed.old_id;

UPDATE "FavorContentSetting" AS row
SET "rulesetId" = renamed.id, "rulesetVersion" = renamed.version
FROM (VALUES
  ('classic-og-v3.0-a', 'classic-og-v1.9-a', '1.9.0-A'),
  ('classic-og-v3.0-b', 'classic-og-v1.9-b', '1.9.0-B'),
  ('classic-og-v3.0-c', 'classic-og-v1.9-c', '1.9.0-C'),
  ('classic-og-v3.0-d', 'classic-og-v1.9-d', '1.9.0-D'),
  ('classic-og-v3.0-e', 'classic-og-v2.0-a', '2.0.0-A'),
  ('classic-og-v3.0-f', 'classic-og-v2.1-a', '2.1.0-A'),
  ('classic-og-v3.0-g', 'classic-og-v2.1-b', '2.1.0-B'),
  ('classic-og-v3.0-h', 'classic-og-v2.1-c', '2.1.0-C'),
  ('classic-og-v3.0-i', 'classic-og-v2.2-a', '2.2.0-A')
) AS renamed(old_id, id, version)
WHERE row."rulesetId" = renamed.old_id;

UPDATE "GameEventDefinition" AS row
SET "rulesetId" = renamed.id, "rulesetVersion" = renamed.version
FROM (VALUES
  ('classic-og-v3.0-a', 'classic-og-v1.9-a', '1.9.0-A'),
  ('classic-og-v3.0-b', 'classic-og-v1.9-b', '1.9.0-B'),
  ('classic-og-v3.0-c', 'classic-og-v1.9-c', '1.9.0-C'),
  ('classic-og-v3.0-d', 'classic-og-v1.9-d', '1.9.0-D'),
  ('classic-og-v3.0-e', 'classic-og-v2.0-a', '2.0.0-A'),
  ('classic-og-v3.0-f', 'classic-og-v2.1-a', '2.1.0-A'),
  ('classic-og-v3.0-g', 'classic-og-v2.1-b', '2.1.0-B'),
  ('classic-og-v3.0-h', 'classic-og-v2.1-c', '2.1.0-C'),
  ('classic-og-v3.0-i', 'classic-og-v2.2-a', '2.2.0-A')
) AS renamed(old_id, id, version)
WHERE row."rulesetId" = renamed.old_id;

UPDATE "Loan" AS row
SET "rulesetId" = renamed.id, "rulesetVersion" = renamed.version
FROM (VALUES
  ('classic-og-v3.0-a', 'classic-og-v1.9-a', '1.9.0-A'),
  ('classic-og-v3.0-b', 'classic-og-v1.9-b', '1.9.0-B'),
  ('classic-og-v3.0-c', 'classic-og-v1.9-c', '1.9.0-C'),
  ('classic-og-v3.0-d', 'classic-og-v1.9-d', '1.9.0-D'),
  ('classic-og-v3.0-e', 'classic-og-v2.0-a', '2.0.0-A'),
  ('classic-og-v3.0-f', 'classic-og-v2.1-a', '2.1.0-A'),
  ('classic-og-v3.0-g', 'classic-og-v2.1-b', '2.1.0-B'),
  ('classic-og-v3.0-h', 'classic-og-v2.1-c', '2.1.0-C'),
  ('classic-og-v3.0-i', 'classic-og-v2.2-a', '2.2.0-A')
) AS renamed(old_id, id, version)
WHERE row."rulesetId" = renamed.old_id;

UPDATE "CriminalCaseFile" AS row
SET "rulesetId" = renamed.id, "rulesetVersion" = renamed.version
FROM (VALUES
  ('classic-og-v3.0-a', 'classic-og-v1.9-a', '1.9.0-A'),
  ('classic-og-v3.0-b', 'classic-og-v1.9-b', '1.9.0-B'),
  ('classic-og-v3.0-c', 'classic-og-v1.9-c', '1.9.0-C'),
  ('classic-og-v3.0-d', 'classic-og-v1.9-d', '1.9.0-D'),
  ('classic-og-v3.0-e', 'classic-og-v2.0-a', '2.0.0-A'),
  ('classic-og-v3.0-f', 'classic-og-v2.1-a', '2.1.0-A'),
  ('classic-og-v3.0-g', 'classic-og-v2.1-b', '2.1.0-B'),
  ('classic-og-v3.0-h', 'classic-og-v2.1-c', '2.1.0-C'),
  ('classic-og-v3.0-i', 'classic-og-v2.2-a', '2.2.0-A')
) AS renamed(old_id, id, version)
WHERE row."rulesetId" = renamed.old_id;

UPDATE "CrewRosterMigration" AS row
SET "rulesetId" = renamed.id
FROM (VALUES
  ('classic-og-v3.0-a', 'classic-og-v1.9-a'),
  ('classic-og-v3.0-b', 'classic-og-v1.9-b'),
  ('classic-og-v3.0-c', 'classic-og-v1.9-c'),
  ('classic-og-v3.0-d', 'classic-og-v1.9-d'),
  ('classic-og-v3.0-e', 'classic-og-v2.0-a'),
  ('classic-og-v3.0-f', 'classic-og-v2.1-a'),
  ('classic-og-v3.0-g', 'classic-og-v2.1-b'),
  ('classic-og-v3.0-h', 'classic-og-v2.1-c'),
  ('classic-og-v3.0-i', 'classic-og-v2.2-a')
) AS renamed(old_id, id)
WHERE row."rulesetId" = renamed.old_id;

UPDATE "AdminLivingStoryDraft" AS row
SET "baseRulesetId" = renamed.id, "baseRulesetVersion" = renamed.version
FROM (VALUES
  ('classic-og-v3.0-a', 'classic-og-v1.9-a', '1.9.0-A'),
  ('classic-og-v3.0-b', 'classic-og-v1.9-b', '1.9.0-B'),
  ('classic-og-v3.0-c', 'classic-og-v1.9-c', '1.9.0-C'),
  ('classic-og-v3.0-d', 'classic-og-v1.9-d', '1.9.0-D'),
  ('classic-og-v3.0-e', 'classic-og-v2.0-a', '2.0.0-A'),
  ('classic-og-v3.0-f', 'classic-og-v2.1-a', '2.1.0-A'),
  ('classic-og-v3.0-g', 'classic-og-v2.1-b', '2.1.0-B'),
  ('classic-og-v3.0-h', 'classic-og-v2.1-c', '2.1.0-C'),
  ('classic-og-v3.0-i', 'classic-og-v2.2-a', '2.2.0-A')
) AS renamed(old_id, id, version)
WHERE row."baseRulesetId" = renamed.old_id;

UPDATE "AccountCosmeticUnlock" AS row
SET "sourceRulesetId" = renamed.id, "sourceRulesetVersion" = renamed.version
FROM (VALUES
  ('classic-og-v3.0-a', 'classic-og-v1.9-a', '1.9.0-A'),
  ('classic-og-v3.0-b', 'classic-og-v1.9-b', '1.9.0-B'),
  ('classic-og-v3.0-c', 'classic-og-v1.9-c', '1.9.0-C'),
  ('classic-og-v3.0-d', 'classic-og-v1.9-d', '1.9.0-D'),
  ('classic-og-v3.0-e', 'classic-og-v2.0-a', '2.0.0-A'),
  ('classic-og-v3.0-f', 'classic-og-v2.1-a', '2.1.0-A'),
  ('classic-og-v3.0-g', 'classic-og-v2.1-b', '2.1.0-B'),
  ('classic-og-v3.0-h', 'classic-og-v2.1-c', '2.1.0-C'),
  ('classic-og-v3.0-i', 'classic-og-v2.2-a', '2.2.0-A')
) AS renamed(old_id, id, version)
WHERE row."sourceRulesetId" = renamed.old_id;
