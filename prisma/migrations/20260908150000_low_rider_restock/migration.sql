-- Section 36. Charlie's chop shop is one man and a lift.
--
-- Same shelf-and-clock shape as Tommy's hardware: a Low-Rider is built rather
-- than picked off a rack, so a fleet is something assembled across days.
-- Existing players start on a full shelf, matching classic-og-v0.1's cap.

ALTER TABLE "RoundPlayer"
  ADD COLUMN "lowRiderStock"   INTEGER      NOT NULL DEFAULT 0,
  ADD COLUMN "lowRiderStockAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "RoundPlayer" SET "lowRiderStock" = 3;
