-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('SCHEDULED', 'REGISTRATION', 'ACTIVE', 'ENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('ROUND_JOINED', 'SCOUT', 'PRODUCE_CRACK', 'STORE_BUY', 'STORE_SELL', 'PAYOUT_CHANGE', 'AWAY_BONUS');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "usernameNormalized" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "rulesetId" TEXT NOT NULL,
    "rulesetVersion" TEXT NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "registrationOpensAt" TIMESTAMP(3),
    "nextPublicPimpId" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scoutModifier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "incomeModifier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "crackModifier" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoundPlayer" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "publicPimpId" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "cashCents" BIGINT NOT NULL DEFAULT 0,
    "turns" INTEGER NOT NULL DEFAULT 0,
    "lastTurnCalculationAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAwayBonusAt" TIMESTAMP(3),
    "payoutPercent" INTEGER NOT NULL DEFAULT 50,
    "whores" INTEGER NOT NULL DEFAULT 0,
    "thugs" INTEGER NOT NULL DEFAULT 0,
    "condoms" INTEGER NOT NULL DEFAULT 0,
    "medicine" INTEGER NOT NULL DEFAULT 0,
    "crack" INTEGER NOT NULL DEFAULT 0,
    "beer" INTEGER NOT NULL DEFAULT 0,
    "pistols" INTEGER NOT NULL DEFAULT 0,
    "shotguns" INTEGER NOT NULL DEFAULT 0,
    "tek9s" INTEGER NOT NULL DEFAULT 0,
    "ak47s" INTEGER NOT NULL DEFAULT 0,
    "lowRiders" INTEGER NOT NULL DEFAULT 0,
    "whoreHappiness" INTEGER NOT NULL DEFAULT 100,
    "thugHappiness" INTEGER NOT NULL DEFAULT 100,
    "netWorthCents" BIGINT NOT NULL DEFAULT 0,
    "localRank" INTEGER,
    "nationalRank" INTEGER,
    "dailyStartingLocalRank" INTEGER,
    "dailyStartingNationalRank" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoundPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameNews" (
    "id" TEXT NOT NULL,
    "roundId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameNews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerActivity" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedAction" (
    "id" TEXT NOT NULL,
    "roundPlayerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessedAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_usernameNormalized_key" ON "Account"("usernameNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Account_email_key" ON "Account"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_accountId_idx" ON "Session"("accountId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Round_slug_key" ON "Round"("slug");

-- CreateIndex
CREATE INDEX "Round_status_idx" ON "Round"("status");

-- CreateIndex
CREATE UNIQUE INDEX "City_slug_key" ON "City"("slug");

-- CreateIndex
CREATE INDEX "RoundPlayer_roundId_netWorthCents_idx" ON "RoundPlayer"("roundId", "netWorthCents" DESC);

-- CreateIndex
CREATE INDEX "RoundPlayer_roundId_cityId_netWorthCents_idx" ON "RoundPlayer"("roundId", "cityId", "netWorthCents" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RoundPlayer_roundId_accountId_key" ON "RoundPlayer"("roundId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "RoundPlayer_roundId_publicPimpId_key" ON "RoundPlayer"("roundId", "publicPimpId");

-- CreateIndex
CREATE INDEX "GameNews_roundId_isPinned_publishedAt_idx" ON "GameNews"("roundId", "isPinned", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "PlayerActivity_roundPlayerId_createdAt_idx" ON "PlayerActivity"("roundPlayerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ProcessedAction_expiresAt_idx" ON "ProcessedAction"("expiresAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundPlayer" ADD CONSTRAINT "RoundPlayer_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundPlayer" ADD CONSTRAINT "RoundPlayer_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoundPlayer" ADD CONSTRAINT "RoundPlayer_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameNews" ADD CONSTRAINT "GameNews_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameNews" ADD CONSTRAINT "GameNews_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerActivity" ADD CONSTRAINT "PlayerActivity_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessedAction" ADD CONSTRAINT "ProcessedAction_roundPlayerId_fkey" FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
