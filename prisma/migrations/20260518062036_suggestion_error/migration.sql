-- AlterTable
ALTER TABLE "Keyword" ADD COLUMN     "suggestionLastError" TEXT,
ADD COLUMN     "suggestionLastErrorAt" TIMESTAMP(3);
