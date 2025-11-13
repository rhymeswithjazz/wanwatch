-- CreateIndex
CREATE INDEX "ConnectionCheck_timestamp_idx" ON "ConnectionCheck"("timestamp");

-- CreateIndex
CREATE INDEX "ConnectionCheck_isConnected_timestamp_idx" ON "ConnectionCheck"("isConnected", "timestamp");

-- CreateIndex
CREATE INDEX "Outage_isResolved_startTime_idx" ON "Outage"("isResolved", "startTime");

-- CreateIndex
CREATE INDEX "Outage_startTime_idx" ON "Outage"("startTime");
