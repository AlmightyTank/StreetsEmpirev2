-- Default-off supporter release-notes credit opt-in.
ALTER TABLE "AccountProfile" ADD COLUMN "releaseNotesCreditOptIn" BOOLEAN NOT NULL DEFAULT false;
