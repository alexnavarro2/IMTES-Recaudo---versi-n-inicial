CREATE TABLE "WeeklyImport" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "source" "FolderType" NOT NULL, "folderId" TEXT NOT NULL, "year" INTEGER NOT NULL, "week" INTEGER NOT NULL,
 "fingerprint" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "result" JSONB,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "WeeklyImport_userId_source_folderId_year_week_key" ON "WeeklyImport"("userId","source","folderId","year","week");
CREATE TABLE "ValidationCard" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
 "folderId" TEXT NOT NULL, "year" INTEGER NOT NULL, "cardHash" TEXT NOT NULL, "firstDate" TEXT NOT NULL
);
CREATE UNIQUE INDEX "ValidationCard_userId_folderId_year_cardHash_key" ON "ValidationCard"("userId","folderId","year","cardHash");
CREATE INDEX "ValidationCard_userId_folderId_year_idx" ON "ValidationCard"("userId","folderId","year");
ALTER TABLE "WeeklyImport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ValidationCard" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "WeeklyImport", "ValidationCard" FROM anon, authenticated;
