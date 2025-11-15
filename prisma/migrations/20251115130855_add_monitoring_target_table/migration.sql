-- CreateTable
CREATE TABLE "MonitoringTarget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "target" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "MonitoringTarget_target_key" ON "MonitoringTarget"("target");

-- CreateIndex
CREATE INDEX "MonitoringTarget_isEnabled_idx" ON "MonitoringTarget"("isEnabled");

-- CreateIndex
CREATE INDEX "MonitoringTarget_priority_idx" ON "MonitoringTarget"("priority");

-- CreateIndex
CREATE INDEX "MonitoringTarget_isEnabled_priority_idx" ON "MonitoringTarget"("isEnabled", "priority");
