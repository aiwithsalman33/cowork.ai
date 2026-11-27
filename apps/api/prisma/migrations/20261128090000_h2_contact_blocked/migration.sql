-- H2: owners can block a customer from AI replies
ALTER TABLE "Contact" ADD COLUMN "blockedAt" TIMESTAMP(3);
