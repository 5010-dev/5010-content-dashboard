-- CreateTable
CREATE TABLE "SeoSuggestion" (
    "id" SERIAL NOT NULL,
    "keywordId" INTEGER NOT NULL,
    "analysis" TEXT NOT NULL,
    "contentIdeas" JSONB NOT NULL,
    "strategy" TEXT NOT NULL,
    "basedOnRank" INTEGER,
    "basedOnEngine" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoSuggestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeoSuggestion_keywordId_key" ON "SeoSuggestion"("keywordId");

-- AddForeignKey
ALTER TABLE "SeoSuggestion" ADD CONSTRAINT "SeoSuggestion_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;
