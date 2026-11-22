CREATE TABLE "WhatsAppTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "metaId" TEXT,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "header" TEXT,
    "body" TEXT NOT NULL,
    "footer" TEXT,
    "variables" INTEGER NOT NULL DEFAULT 0,
    "components" JSONB NOT NULL DEFAULT '[]',
    "useInAi" BOOLEAN NOT NULL DEFAULT true,
    "aiHint" TEXT NOT NULL DEFAULT '',
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WhatsAppTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WhatsAppTemplate_channelId_name_language_key" ON "WhatsAppTemplate"("channelId", "name", "language");
CREATE INDEX "WhatsAppTemplate_userId_idx" ON "WhatsAppTemplate"("userId");
ALTER TABLE "WhatsAppTemplate" ADD CONSTRAINT "WhatsAppTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppTemplate" ADD CONSTRAINT "WhatsAppTemplate_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
