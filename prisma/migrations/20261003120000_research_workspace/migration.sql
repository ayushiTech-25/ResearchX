-- AlterTable
ALTER TABLE "Collection" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "SavedItem" ADD COLUMN     "paperId" TEXT,
ADD COLUMN     "researcherId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3),
ADD COLUMN     "userId" TEXT;

-- Preserve existing saved collections when upgrading from the original schema.
UPDATE "SavedItem" AS saved
SET "userId" = collection."userId",
    "updatedAt" = saved."createdAt"
FROM "Collection" AS collection
WHERE saved."collectionId" = collection."id";

ALTER TABLE "SavedItem" ALTER COLUMN "userId" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateTable
CREATE TABLE "ResearcherPaper" (
    "researcherId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "authorOrder" INTEGER,
    "institution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearcherPaper_pkey" PRIMARY KEY ("researcherId","paperId")
);

-- CreateTable
CREATE TABLE "Researcher" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "displayName" TEXT,
    "worksCount" INTEGER,
    "citedByCount" INTEGER,
    "institutionName" TEXT,
    "institutionId" TEXT,
    "externalUrl" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Researcher_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paper" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "doi" TEXT,
    "title" TEXT,
    "abstract" TEXT,
    "publicationYear" INTEGER,
    "publicationDate" TIMESTAMP(3),
    "citedByCount" INTEGER,
    "source" TEXT NOT NULL,
    "externalUrl" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Paper_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Author" (
    "id" TEXT NOT NULL,
    "externalId" TEXT,
    "displayName" TEXT,
    "researcherId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Author_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthorPaper" (
    "authorId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "authorOrder" INTEGER,
    "institution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthorPaper_pkey" PRIMARY KEY ("authorId","paperId")
);

-- CreateTable
CREATE TABLE "ResearchTopic" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "worksCount" INTEGER,
    "citedByCount" INTEGER,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearcherTopic" (
    "researcherId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,

    CONSTRAINT "ResearcherTopic_pkey" PRIMARY KEY ("researcherId","topicId")
);

-- CreateTable
CREATE TABLE "PaperTopic" (
    "paperId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "score" DOUBLE PRECISION,

    CONSTRAINT "PaperTopic_pkey" PRIMARY KEY ("paperId","topicId")
);

-- CreateTable
CREATE TABLE "ResearchWorkspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspacePaper" (
    "workspaceId" TEXT NOT NULL,
    "paperId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspacePaper_pkey" PRIMARY KEY ("workspaceId","paperId")
);

-- CreateTable
CREATE TABLE "WorkspaceResearcher" (
    "workspaceId" TEXT NOT NULL,
    "researcherId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceResearcher_pkey" PRIMARY KEY ("workspaceId","researcherId")
);

-- CreateTable
CREATE TABLE "PaperAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paperId" TEXT,
    "sourceTitle" TEXT,
    "suppliedText" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchChat" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResearchChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchChatMessage" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearchTrend" (
    "id" TEXT NOT NULL,
    "topicId" TEXT,
    "paperId" TEXT,
    "topicName" TEXT NOT NULL,
    "worksCount" INTEGER,
    "citedByCount" INTEGER,
    "publicationYear" INTEGER,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchTrend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResearcherRelation" (
    "id" TEXT NOT NULL,
    "researcherId" TEXT NOT NULL,
    "relatedResearcherId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "sharedPaperCount" INTEGER,
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearcherRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ResearcherPaper_paperId_authorOrder_idx" ON "ResearcherPaper"("paperId", "authorOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Researcher_externalId_key" ON "Researcher"("externalId");

-- CreateIndex
CREATE INDEX "Researcher_displayName_idx" ON "Researcher"("displayName");

-- CreateIndex
CREATE INDEX "Researcher_institutionId_idx" ON "Researcher"("institutionId");

-- CreateIndex
CREATE UNIQUE INDEX "Paper_externalId_key" ON "Paper"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Paper_doi_key" ON "Paper"("doi");

-- CreateIndex
CREATE INDEX "Paper_publicationYear_idx" ON "Paper"("publicationYear");

-- CreateIndex
CREATE INDEX "Paper_citedByCount_idx" ON "Paper"("citedByCount");

-- CreateIndex
CREATE INDEX "Paper_title_idx" ON "Paper"("title");

-- CreateIndex
CREATE INDEX "Paper_source_publicationYear_idx" ON "Paper"("source", "publicationYear");

-- CreateIndex
CREATE UNIQUE INDEX "Author_externalId_key" ON "Author"("externalId");

-- CreateIndex
CREATE INDEX "Author_displayName_idx" ON "Author"("displayName");

-- CreateIndex
CREATE INDEX "Author_researcherId_idx" ON "Author"("researcherId");

-- CreateIndex
CREATE INDEX "AuthorPaper_paperId_authorOrder_idx" ON "AuthorPaper"("paperId", "authorOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchTopic_externalId_key" ON "ResearchTopic"("externalId");

-- CreateIndex
CREATE INDEX "ResearchTopic_name_idx" ON "ResearchTopic"("name");

-- CreateIndex
CREATE INDEX "ResearcherTopic_topicId_score_idx" ON "ResearcherTopic"("topicId", "score");

-- CreateIndex
CREATE INDEX "PaperTopic_topicId_score_idx" ON "PaperTopic"("topicId", "score");

-- CreateIndex
CREATE INDEX "ResearchWorkspace_userId_updatedAt_idx" ON "ResearchWorkspace"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "WorkspacePaper_paperId_idx" ON "WorkspacePaper"("paperId");

-- CreateIndex
CREATE INDEX "WorkspaceResearcher_researcherId_idx" ON "WorkspaceResearcher"("researcherId");

-- CreateIndex
CREATE INDEX "PaperAnalysis_userId_createdAt_idx" ON "PaperAnalysis"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PaperAnalysis_paperId_createdAt_idx" ON "PaperAnalysis"("paperId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchChat_userId_updatedAt_idx" ON "ResearchChat"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ResearchChat_workspaceId_updatedAt_idx" ON "ResearchChat"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "ResearchChatMessage_chatId_createdAt_idx" ON "ResearchChatMessage"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "ResearchTrend_topicId_snapshotAt_idx" ON "ResearchTrend"("topicId", "snapshotAt");

-- CreateIndex
CREATE INDEX "ResearchTrend_publicationYear_topicName_idx" ON "ResearchTrend"("publicationYear", "topicName");

-- CreateIndex
CREATE UNIQUE INDEX "ResearchTrend_topicId_publicationYear_snapshotAt_key" ON "ResearchTrend"("topicId", "publicationYear", "snapshotAt");

-- CreateIndex
CREATE INDEX "ResearcherRelation_researcherId_relationType_idx" ON "ResearcherRelation"("researcherId", "relationType");

-- CreateIndex
CREATE INDEX "ResearcherRelation_relatedResearcherId_relationType_idx" ON "ResearcherRelation"("relatedResearcherId", "relationType");

-- CreateIndex
CREATE UNIQUE INDEX "ResearcherRelation_researcherId_relatedResearcherId_relatio_key" ON "ResearcherRelation"("researcherId", "relatedResearcherId", "relationType");

-- CreateIndex
CREATE INDEX "Collection_workspaceId_idx" ON "Collection"("workspaceId");

-- CreateIndex
CREATE INDEX "SavedItem_userId_createdAt_idx" ON "SavedItem"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SavedItem_paperId_idx" ON "SavedItem"("paperId");

-- CreateIndex
CREATE INDEX "SavedItem_researcherId_idx" ON "SavedItem"("researcherId");

-- AddForeignKey
ALTER TABLE "ResearcherPaper" ADD CONSTRAINT "ResearcherPaper_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearcherPaper" ADD CONSTRAINT "ResearcherPaper_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Author" ADD CONSTRAINT "Author_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorPaper" ADD CONSTRAINT "AuthorPaper_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthorPaper" ADD CONSTRAINT "AuthorPaper_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearcherTopic" ADD CONSTRAINT "ResearcherTopic_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearcherTopic" ADD CONSTRAINT "ResearcherTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "ResearchTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperTopic" ADD CONSTRAINT "PaperTopic_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperTopic" ADD CONSTRAINT "PaperTopic_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "ResearchTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedItem" ADD CONSTRAINT "SavedItem_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ResearchWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchWorkspace" ADD CONSTRAINT "ResearchWorkspace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspacePaper" ADD CONSTRAINT "WorkspacePaper_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ResearchWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspacePaper" ADD CONSTRAINT "WorkspacePaper_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceResearcher" ADD CONSTRAINT "WorkspaceResearcher_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ResearchWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceResearcher" ADD CONSTRAINT "WorkspaceResearcher_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperAnalysis" ADD CONSTRAINT "PaperAnalysis_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaperAnalysis" ADD CONSTRAINT "PaperAnalysis_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchChat" ADD CONSTRAINT "ResearchChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchChat" ADD CONSTRAINT "ResearchChat_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "ResearchWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchChatMessage" ADD CONSTRAINT "ResearchChatMessage_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "ResearchChat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchTrend" ADD CONSTRAINT "ResearchTrend_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "ResearchTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearchTrend" ADD CONSTRAINT "ResearchTrend_paperId_fkey" FOREIGN KEY ("paperId") REFERENCES "Paper"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearcherRelation" ADD CONSTRAINT "ResearcherRelation_researcherId_fkey" FOREIGN KEY ("researcherId") REFERENCES "Researcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResearcherRelation" ADD CONSTRAINT "ResearcherRelation_relatedResearcherId_fkey" FOREIGN KEY ("relatedResearcherId") REFERENCES "Researcher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
