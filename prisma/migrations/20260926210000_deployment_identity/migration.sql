-- 1.0.0-A: the environment that owns this database. Claimed on the first production
-- or beta boot; empty until then, so existing databases need no manual step.

-- CreateTable
CREATE TABLE "DeploymentIdentity" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "environment" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastBootAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastBootVersion" TEXT NOT NULL,

    CONSTRAINT "DeploymentIdentity_pkey" PRIMARY KEY ("id")
);

