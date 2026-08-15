-- Payroll periods for commission payout close

CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'CLOSED', 'PAID');

CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'CLOSED',
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayrollPeriod_fromDate_toDate_idx" ON "PayrollPeriod"("fromDate", "toDate");
CREATE INDEX "PayrollPeriod_status_idx" ON "PayrollPeriod"("status");
CREATE INDEX "PayrollPeriod_branchId_idx" ON "PayrollPeriod"("branchId");

CREATE TABLE "PayrollLine" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "commissionPct" DOUBLE PRECISION NOT NULL,
    "serviceRevenue" DECIMAL(12,2) NOT NULL,
    "productRevenue" DECIMAL(12,2) NOT NULL,
    "revenue" DECIMAL(12,2) NOT NULL,
    "salesCount" INTEGER NOT NULL,
    "commission" DECIMAL(12,2) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PayrollLine_periodId_idx" ON "PayrollLine"("periodId");
CREATE INDEX "PayrollLine_staffId_idx" ON "PayrollLine"("staffId");

ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollLine" ADD CONSTRAINT "PayrollLine_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
