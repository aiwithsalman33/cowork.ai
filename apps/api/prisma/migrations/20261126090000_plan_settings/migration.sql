CREATE TABLE "PlanSetting" (
    "plan" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlanSetting_pkey" PRIMARY KEY ("plan")
);
