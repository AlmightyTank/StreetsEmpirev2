-- Survey Phase A: durable survey definitions, questions and one rewarded
-- completion per account.
CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'LIVE', 'CLOSED');

CREATE TYPE "SurveyQuestionType" AS ENUM (
  'YES_NO',
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'RATING',
  'SHORT_TEXT',
  'LONG_TEXT'
);

CREATE TABLE "Survey" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "status" "SurveyStatus" NOT NULL DEFAULT 'DRAFT',
  "releaseTag" TEXT,
  "featureTag" TEXT,
  "roundId" TEXT,
  "rewards" JSONB NOT NULL DEFAULT '[]',
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdByUsername" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Survey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SurveyQuestion" (
  "id" TEXT NOT NULL,
  "surveyId" TEXT NOT NULL,
  "type" "SurveyQuestionType" NOT NULL,
  "prompt" TEXT NOT NULL,
  "description" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "position" INTEGER NOT NULL,
  "minLength" INTEGER,
  "maxLength" INTEGER,
  "ratingMin" INTEGER,
  "ratingMax" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SurveyQuestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SurveyOption" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "position" INTEGER NOT NULL,

  CONSTRAINT "SurveyOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SurveySubmission" (
  "id" TEXT NOT NULL,
  "surveyId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "roundPlayerId" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "rewardSnapshot" JSONB NOT NULL DEFAULT '[]',
  "rewardGrantedAt" TIMESTAMP(3),

  CONSTRAINT "SurveySubmission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SurveyAnswer" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SurveyAnswer_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Survey_status_startsAt_endsAt_idx" ON "Survey"("status", "startsAt", "endsAt");
CREATE INDEX "Survey_roundId_status_idx" ON "Survey"("roundId", "status");
CREATE INDEX "Survey_releaseTag_idx" ON "Survey"("releaseTag");
CREATE INDEX "Survey_featureTag_idx" ON "Survey"("featureTag");

CREATE UNIQUE INDEX "SurveyQuestion_surveyId_position_key" ON "SurveyQuestion"("surveyId", "position");
CREATE INDEX "SurveyQuestion_surveyId_type_idx" ON "SurveyQuestion"("surveyId", "type");

CREATE UNIQUE INDEX "SurveyOption_questionId_value_key" ON "SurveyOption"("questionId", "value");
CREATE UNIQUE INDEX "SurveyOption_questionId_position_key" ON "SurveyOption"("questionId", "position");

CREATE UNIQUE INDEX "SurveySubmission_surveyId_accountId_key" ON "SurveySubmission"("surveyId", "accountId");
CREATE INDEX "SurveySubmission_surveyId_submittedAt_idx" ON "SurveySubmission"("surveyId", "submittedAt" DESC);
CREATE INDEX "SurveySubmission_accountId_submittedAt_idx" ON "SurveySubmission"("accountId", "submittedAt" DESC);
CREATE INDEX "SurveySubmission_roundPlayerId_idx" ON "SurveySubmission"("roundPlayerId");

CREATE UNIQUE INDEX "SurveyAnswer_submissionId_questionId_key" ON "SurveyAnswer"("submissionId", "questionId");
CREATE INDEX "SurveyAnswer_questionId_createdAt_idx" ON "SurveyAnswer"("questionId", "createdAt");

ALTER TABLE "Survey"
  ADD CONSTRAINT "Survey_roundId_fkey"
  FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SurveyQuestion"
  ADD CONSTRAINT "SurveyQuestion_surveyId_fkey"
  FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SurveyOption"
  ADD CONSTRAINT "SurveyOption_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SurveySubmission"
  ADD CONSTRAINT "SurveySubmission_surveyId_fkey"
  FOREIGN KEY ("surveyId") REFERENCES "Survey"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SurveySubmission"
  ADD CONSTRAINT "SurveySubmission_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SurveySubmission"
  ADD CONSTRAINT "SurveySubmission_roundPlayerId_fkey"
  FOREIGN KEY ("roundPlayerId") REFERENCES "RoundPlayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "SurveyAnswer"
  ADD CONSTRAINT "SurveyAnswer_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "SurveySubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SurveyAnswer"
  ADD CONSTRAINT "SurveyAnswer_questionId_fkey"
  FOREIGN KEY ("questionId") REFERENCES "SurveyQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
