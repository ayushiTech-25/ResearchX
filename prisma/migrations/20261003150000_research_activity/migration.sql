CREATE TABLE "ResearchActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "targetName" TEXT,
    "contextName" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResearchActivity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ResearchActivity_userId_createdAt_idx" ON "ResearchActivity"("userId", "createdAt");

ALTER TABLE "ResearchActivity"
ADD CONSTRAINT "ResearchActivity_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
