-- M11: tenant-scoped lists filter by userId
CREATE INDEX "IntegrationRequest_userId_idx" ON "IntegrationRequest"("userId");
CREATE INDEX "Schedule_userId_idx" ON "Schedule"("userId");
