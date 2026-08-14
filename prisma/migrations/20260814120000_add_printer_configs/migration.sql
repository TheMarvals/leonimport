CREATE TYPE "PrinterPurpose" AS ENUM ('PACKING', 'SKU');

CREATE TABLE "PrinterConfig" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "printNodeId" INTEGER NOT NULL,
    "purpose" "PrinterPurpose" NOT NULL,
    "stationName" TEXT,
    "labelSize" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrinterConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrinterConfig_printNodeId_key" ON "PrinterConfig"("printNodeId");
CREATE INDEX "PrinterConfig_purpose_stationName_isActive_idx" ON "PrinterConfig"("purpose", "stationName", "isActive");
