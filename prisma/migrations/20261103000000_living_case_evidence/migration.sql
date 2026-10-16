-- Living Streets 2.0.0-D: one verified Activity receipt advances at most one case.
-- ActivityService is the only automatic evidence producer; replays cannot
-- duplicate or cross-credit the same settled action across cases.
CREATE UNIQUE INDEX "CriminalCaseEvidence_sourceReceiptId_key" ON "CriminalCaseEvidence"("sourceReceiptId");
