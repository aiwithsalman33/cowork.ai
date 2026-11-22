-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approvedAt" TIMESTAMP(3);


-- Accounts that existed before manual approval keep their access.
UPDATE "User" SET "approvedAt" = COALESCE("emailVerifiedAt", "createdAt") WHERE "approvedAt" IS NULL AND "emailVerifiedAt" IS NOT NULL;
