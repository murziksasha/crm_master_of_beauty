-- Service material recipes (BOM) for auto stock deduct on service sales

CREATE TABLE "ServiceMaterial" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unitNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ServiceMaterial_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceMaterial_serviceId_productId_key" ON "ServiceMaterial"("serviceId", "productId");
CREATE INDEX "ServiceMaterial_productId_idx" ON "ServiceMaterial"("productId");

ALTER TABLE "ServiceMaterial" ADD CONSTRAINT "ServiceMaterial_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceMaterial" ADD CONSTRAINT "ServiceMaterial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
