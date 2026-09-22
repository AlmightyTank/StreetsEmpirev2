-- Invite-only beta access is opt-in per deployment; approval is stored on the permanent account.
ALTER TABLE "Account"
  ADD COLUMN "betaApproved" BOOLEAN NOT NULL DEFAULT false;
