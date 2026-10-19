-- Mentoring: a new player names one seasoned mentor, who earns XP as they level.
CREATE TABLE "Mentorship" (
    "id" TEXT NOT NULL,
    "mentorAccountId" TEXT NOT NULL,
    "menteeAccountId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mentorship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Mentorship_menteeAccountId_key" ON "Mentorship"("menteeAccountId");
CREATE INDEX "Mentorship_mentorAccountId_idx" ON "Mentorship"("mentorAccountId");

ALTER TABLE "Mentorship" ADD CONSTRAINT "Mentorship_mentorAccountId_fkey" FOREIGN KEY ("mentorAccountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Mentorship" ADD CONSTRAINT "Mentorship_menteeAccountId_fkey" FOREIGN KEY ("menteeAccountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
