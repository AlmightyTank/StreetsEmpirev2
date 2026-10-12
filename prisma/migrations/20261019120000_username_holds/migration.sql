-- A name a player gives up is held for them for 30 days, so nobody else can pick it up and
-- pass themselves off as them. Holds are read from the name history by the old name's key.
ALTER TABLE "AccountUsernameChange" ADD COLUMN "fromUsernameNormalized" TEXT;
UPDATE "AccountUsernameChange" SET "fromUsernameNormalized" = lower("fromUsername");
ALTER TABLE "AccountUsernameChange" ALTER COLUMN "fromUsernameNormalized" SET NOT NULL;

CREATE INDEX "AccountUsernameChange_fromUsernameNormalized_createdAt_idx" ON "AccountUsernameChange"("fromUsernameNormalized", "createdAt");
