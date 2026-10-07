CREATE TABLE "WeeklyReport" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "year" INTEGER NOT NULL, "week" INTEGER NOT NULL, "cutoff" TEXT NOT NULL,
 "fingerprint" TEXT NOT NULL, "summary" JSONB NOT NULL, "pptx" BYTEA NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "WeeklyReport_userId_year_week_fingerprint_key" ON "WeeklyReport"("userId","year","week","fingerprint");
CREATE INDEX "WeeklyReport_userId_createdAt_idx" ON "WeeklyReport"("userId","createdAt");
ALTER TABLE "WeeklyReport" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "WeeklyReport" FROM anon, authenticated;
