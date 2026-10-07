CREATE TABLE "WeeklyUpload" ("id" TEXT NOT NULL,"userId" TEXT NOT NULL,"source" "FolderType" NOT NULL,"folderId" TEXT NOT NULL,"year" INTEGER NOT NULL,"week" INTEGER NOT NULL,"name" TEXT NOT NULL,"size" INTEGER NOT NULL,"digest" TEXT NOT NULL,"expiresAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "WeeklyUpload_pkey" PRIMARY KEY ("id"),CONSTRAINT "WeeklyUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE);
CREATE TABLE "WeeklyUploadChunk" ("uploadId" TEXT NOT NULL,"part" INTEGER NOT NULL,"digest" TEXT NOT NULL,"data" BYTEA NOT NULL,CONSTRAINT "WeeklyUploadChunk_pkey" PRIMARY KEY ("uploadId","part"),CONSTRAINT "WeeklyUploadChunk_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "WeeklyUpload"("id") ON DELETE CASCADE);
CREATE INDEX "WeeklyUpload_userId_expiresAt_idx" ON "WeeklyUpload"("userId","expiresAt");
ALTER TABLE "WeeklyUpload" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WeeklyUploadChunk" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "WeeklyUpload","WeeklyUploadChunk" FROM anon,authenticated;
