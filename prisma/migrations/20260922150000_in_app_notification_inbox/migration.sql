-- Durable in-game notification inbox for toast-worthy player activity.
CREATE TABLE "InAppNotification" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InAppNotification_activityId_key" ON "InAppNotification"("activityId");
CREATE INDEX "InAppNotification_roundPlayerId_readAt_createdAt_idx"
  ON "InAppNotification"("roundPlayerId", "readAt", "createdAt" DESC);

ALTER TABLE "InAppNotification"
  ADD CONSTRAINT "InAppNotification_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InAppNotification"
  ADD CONSTRAINT "InAppNotification_activityId_fkey"
  FOREIGN KEY ("activityId") REFERENCES "PlayerActivity"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "InAppNotification" ("id", "roundPlayerId", "activityId", "createdAt")
SELECT a."id", a."roundPlayerId", a."id", a."createdAt"
FROM "PlayerActivity" a
WHERE a."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND (
    a."type" IN (
      'QUEST_OBJECTIVE_COMPLETE',
      'QUEST_READY',
      'AWAY_BONUS',
      'ADMIN_GRANT',
      'BATTLE_VOIDED',
      'RAID_DEFENSE',
      'DRIVE_BY_DEFENSE',
      'CONVOY_DEFENSE',
      'TURF_PUSH_DEFENSE',
      'RUN_RETURNED',
      'RUN_INCIDENT',
      'CONVOY_BACKUP',
      'TURF_CLAIM',
      'TURF_PUSH_ATTACK',
      'TURF_PUSH_BACKUP'
    )
    OR (a."type" = 'QUEST_CLAIMED' AND jsonb_array_length(COALESCE(a."payload"->'newlyAvailable', '[]'::jsonb)) > 0)
    OR (a."type" IN ('SCOUT', 'PRODUCE_CRACK') AND a."payload"->>'busted' = 'true')
  )
ON CONFLICT DO NOTHING;
