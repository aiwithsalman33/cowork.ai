-- C1: Telegram Boss Mode is bound to the Telegram user id, not a shared phone number
ALTER TABLE "User" ADD COLUMN "bossTelegramIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "bossLinkCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN "bossLinkCodeExpiresAt" TIMESTAMP(3);

-- Phones on Telegram contacts came from shared contact cards and may have been spoofed.
UPDATE "Contact" SET "phone" = NULL WHERE "channelType" = 'TELEGRAM';
