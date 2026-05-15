-- CreateTable
CREATE TABLE "Keyword" (
    "id" SERIAL NOT NULL,
    "term" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Keyword_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mention" (
    "id" SERIAL NOT NULL,
    "sourceType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "keywordId" INTEGER NOT NULL,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" SERIAL NOT NULL,
    "mentionId" INTEGER NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "sentiment" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SeoRanking" (
    "id" SERIAL NOT NULL,
    "keywordId" INTEGER NOT NULL,
    "engine" TEXT NOT NULL,
    "rank" INTEGER,
    "url" TEXT,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeoRanking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertLog" (
    "id" SERIAL NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AlertLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Keyword_term_key" ON "Keyword"("term");

-- CreateIndex
CREATE UNIQUE INDEX "Mention_url_key" ON "Mention"("url");

-- CreateIndex
CREATE INDEX "Mention_sourceType_fetchedAt_idx" ON "Mention"("sourceType", "fetchedAt");

-- CreateIndex
CREATE INDEX "Mention_keywordId_fetchedAt_idx" ON "Mention"("keywordId", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RiskAssessment_mentionId_key" ON "RiskAssessment"("mentionId");

-- CreateIndex
CREATE INDEX "RiskAssessment_riskLevel_createdAt_idx" ON "RiskAssessment"("riskLevel", "createdAt");

-- CreateIndex
CREATE INDEX "SeoRanking_keywordId_engine_snapshotAt_idx" ON "SeoRanking"("keywordId", "engine", "snapshotAt");

-- CreateIndex
CREATE INDEX "AlertLog_refType_refId_idx" ON "AlertLog"("refType", "refId");

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RiskAssessment" ADD CONSTRAINT "RiskAssessment_mentionId_fkey" FOREIGN KEY ("mentionId") REFERENCES "Mention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SeoRanking" ADD CONSTRAINT "SeoRanking_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE CASCADE ON UPDATE CASCADE;
