-- H5: optional fallback model
ALTER TABLE "Agent" ADD COLUMN "fallbackProvider" TEXT;
ALTER TABLE "Agent" ADD COLUMN "fallbackModel" TEXT;
