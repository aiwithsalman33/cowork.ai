-- C2: allow-list of Google Docs the agent may read
CREATE TABLE "AgentDoc" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentDoc_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AgentDoc_userId_fileId_key" ON "AgentDoc"("userId", "fileId");
CREATE INDEX "AgentDoc_userId_idx" ON "AgentDoc"("userId");
ALTER TABLE "AgentDoc" ADD CONSTRAINT "AgentDoc_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
