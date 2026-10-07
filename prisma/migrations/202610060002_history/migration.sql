-- CreateTable
CREATE TABLE "HistoricalDataset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "FolderType" NOT NULL,
    "folderId" TEXT NOT NULL,
    "rows" JSONB NOT NULL,
    "provenance" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricalDataset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HistoricalDataset_userId_source_key" ON "HistoricalDataset"("userId", "source");

-- AddForeignKey
ALTER TABLE "HistoricalDataset" ADD CONSTRAINT "HistoricalDataset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "HistoricalDataset" ENABLE ROW LEVEL SECURITY;
