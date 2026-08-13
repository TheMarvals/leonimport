CREATE TABLE "MercadoLibreAccount" (
    "id" TEXT NOT NULL,
    "gatewayAccountId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "siteId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MercadoLibreAccount_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Order" ADD COLUMN "mlAccountId" TEXT;

CREATE UNIQUE INDEX "MercadoLibreAccount_gatewayAccountId_key" ON "MercadoLibreAccount"("gatewayAccountId");
CREATE INDEX "MercadoLibreAccount_isActive_idx" ON "MercadoLibreAccount"("isActive");
CREATE INDEX "MercadoLibreAccount_sellerId_idx" ON "MercadoLibreAccount"("sellerId");
CREATE INDEX "Order_mlAccountId_idx" ON "Order"("mlAccountId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_mlAccountId_fkey"
FOREIGN KEY ("mlAccountId") REFERENCES "MercadoLibreAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
