-- CreateTable
CREATE TABLE "Runtime" (
    "id" UUID NOT NULL,
    "profileId" UUID NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'STOPPED',
    "fencingToken" INTEGER NOT NULL DEFAULT 0,
    "leaseId" TEXT,
    "leaseSessionId" UUID,
    "leaseAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Runtime_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Runtime_profileId_key" ON "Runtime"("profileId");

-- AddForeignKey
ALTER TABLE "Runtime" ADD CONSTRAINT "Runtime_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "BrowserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
