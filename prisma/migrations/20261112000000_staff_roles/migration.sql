-- Staff roles: Founder, Admin, Mod, JR Mod, Helper. staffRole replaces the isAdmin flag;
-- isAdmin stays as "staffRole is FOUNDER or ADMIN" so existing code keeps working.

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('FOUNDER', 'ADMIN', 'MOD', 'JR_MOD', 'HELPER');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "staffRole" "StaffRole";

-- Every current admin becomes ADMIN. The Founder is set once from the console
-- (npm run admin -- <name> --founder).
UPDATE "Account" SET "staffRole" = 'ADMIN' WHERE "isAdmin";

-- CreateTable
CREATE TABLE "StaffRoleChange" (
    "id" TEXT NOT NULL,
    "accountId" TEXT,
    "username" TEXT NOT NULL,
    "actorAccountId" TEXT,
    "actorUsername" TEXT NOT NULL,
    "fromRole" "StaffRole",
    "toRole" "StaffRole",
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffRoleChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffRoleChange_accountId_createdAt_idx" ON "StaffRoleChange"("accountId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StaffRoleChange_createdAt_idx" ON "StaffRoleChange"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Account_staffRole_idx" ON "Account"("staffRole");

-- AddForeignKey
ALTER TABLE "StaffRoleChange" ADD CONSTRAINT "StaffRoleChange_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffRoleChange" ADD CONSTRAINT "StaffRoleChange_actorAccountId_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- There is one Founder.
CREATE UNIQUE INDEX "Account_one_founder" ON "Account"(("staffRole")) WHERE "staffRole" = 'FOUNDER';

-- Keep isAdmin in step with staffRole. A write that changes staffRole decides isAdmin.
-- A legacy write that changes only isAdmin moves staffRole to ADMIN (true) or off ADMIN
-- (false); it never touches a Mod, JR Mod or Helper, and it can never remove the Founder.
CREATE FUNCTION "Account_sync_staff_role"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."staffRole" IS NULL AND NEW."isAdmin" THEN
      NEW."staffRole" := 'ADMIN';
    END IF;
  ELSIF NEW."staffRole" IS NOT DISTINCT FROM OLD."staffRole" AND NEW."isAdmin" IS DISTINCT FROM OLD."isAdmin" THEN
    IF OLD."staffRole" = 'FOUNDER' THEN
      RAISE EXCEPTION 'The Founder keeps admin access.' USING ERRCODE = 'check_violation';
    ELSIF NEW."isAdmin" THEN
      NEW."staffRole" := 'ADMIN';
    ELSIF OLD."staffRole" = 'ADMIN' THEN
      NEW."staffRole" := NULL;
    END IF;
  END IF;
  NEW."isAdmin" := COALESCE(NEW."staffRole" IN ('FOUNDER', 'ADMIN'), false);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Account_sync_staff_role"
  BEFORE INSERT OR UPDATE OF "isAdmin", "staffRole" ON "Account"
  FOR EACH ROW EXECUTE FUNCTION "Account_sync_staff_role"();

ALTER TABLE "Account" ADD CONSTRAINT "Account_isAdmin_matches_staffRole"
  CHECK ("isAdmin" = COALESCE("staffRole" IN ('FOUNDER', 'ADMIN'), false));
