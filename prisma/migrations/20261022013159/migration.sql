-- RenameIndex
DO $$
BEGIN
  IF to_regclass('public."CareerStoryChoice_instance_chapter_key"') IS NOT NULL THEN
    ALTER INDEX "CareerStoryChoice_instance_chapter_key" RENAME TO "CareerStoryChoice_instanceId_chapterKey_key";
  END IF;
END $$;

-- RenameIndex
DO $$
BEGIN
  IF to_regclass('public."CareerStoryInstance_player_career_version_key"') IS NOT NULL THEN
    ALTER INDEX "CareerStoryInstance_player_career_version_key" RENAME TO "CareerStoryInstance_roundPlayerId_career_catalogVersion_key";
  END IF;
END $$;

-- RenameIndex
DO $$
BEGIN
  IF to_regclass('public."CareerStoryInstance_round_career_status_idx"') IS NOT NULL THEN
    ALTER INDEX "CareerStoryInstance_round_career_status_idx" RENAME TO "CareerStoryInstance_roundId_career_status_idx";
  END IF;
END $$;

-- RenameIndex
DO $$
BEGIN
  IF to_regclass('public."CareerStoryPortfolio_account_visibility_idx"') IS NOT NULL THEN
    ALTER INDEX "CareerStoryPortfolio_account_visibility_idx" RENAME TO "CareerStoryPortfolio_accountId_visibility_idx";
  END IF;
END $$;

-- RenameIndex
DO $$
BEGIN
  IF to_regclass('public."CareerStoryPortfolio_instance_key"') IS NOT NULL THEN
    ALTER INDEX "CareerStoryPortfolio_instance_key" RENAME TO "CareerStoryPortfolio_instanceId_key";
  END IF;
END $$;

-- RenameIndex
DO $$
BEGIN
  IF to_regclass('public."CareerStoryRelationship_instance_subject_key"') IS NOT NULL THEN
    ALTER INDEX "CareerStoryRelationship_instance_subject_key" RENAME TO "CareerStoryRelationship_instanceId_subjectKey_relationshipK_key";
  END IF;
END $$;

-- RenameIndex
DO $$
BEGIN
  IF to_regclass('public."CareerStorySourceClaim_idempotency_key"') IS NOT NULL THEN
    ALTER INDEX "CareerStorySourceClaim_idempotency_key" RENAME TO "CareerStorySourceClaim_instanceId_sourceKind_sourceId_objec_key";
  END IF;
END $$;

-- RenameIndex
DO $$
BEGIN
  IF to_regclass('public."CareerStorySourceClaim_instance_objective_idx"') IS NOT NULL THEN
    ALTER INDEX "CareerStorySourceClaim_instance_objective_idx" RENAME TO "CareerStorySourceClaim_instanceId_objectiveKey_idx";
  END IF;
END $$;

-- RenameIndex
DO $$
BEGIN
  IF to_regclass('public."RivalryPublicStoryDecision_relationshipId_published_decidedAt_i"') IS NOT NULL THEN
    ALTER INDEX "RivalryPublicStoryDecision_relationshipId_published_decidedAt_i" RENAME TO "RivalryPublicStoryDecision_relationshipId_published_decided_idx";
  ELSIF to_regclass('public."RivalryPublicStoryDecision_relationshipId_published_decidedAt_idx"') IS NOT NULL THEN
    ALTER INDEX "RivalryPublicStoryDecision_relationshipId_published_decidedAt_idx" RENAME TO "RivalryPublicStoryDecision_relationshipId_published_decided_idx";
  END IF;
END $$;
