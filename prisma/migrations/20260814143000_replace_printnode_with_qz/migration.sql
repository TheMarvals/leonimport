ALTER TABLE "PrinterConfig" ADD COLUMN "printerName" TEXT;
UPDATE "PrinterConfig" SET "printerName" = "name" WHERE "printerName" IS NULL;
ALTER TABLE "PrinterConfig" ALTER COLUMN "printerName" SET NOT NULL;
DROP INDEX IF EXISTS "PrinterConfig_printNodeId_key";
ALTER TABLE "PrinterConfig" DROP COLUMN "printNodeId";
