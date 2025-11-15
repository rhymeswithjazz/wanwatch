-- CreateTable
CREATE TABLE "SpeedTest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloadMbps" REAL NOT NULL,
    "uploadMbps" REAL NOT NULL,
    "pingMs" REAL NOT NULL,
    "jitterMs" REAL,
    "serverId" TEXT,
    "serverName" TEXT,
    "serverCountry" TEXT,
    "isp" TEXT,
    "externalIp" TEXT,
    "resultUrl" TEXT
);

-- CreateIndex
CREATE INDEX "SpeedTest_timestamp_idx" ON "SpeedTest"("timestamp");
