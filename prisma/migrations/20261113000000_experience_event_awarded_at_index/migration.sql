-- Yearly XP leaderboard: sum account XP over a calendar year.
CREATE INDEX "PlayerExperienceEvent_awardedAt_idx" ON "PlayerExperienceEvent"("awardedAt");
