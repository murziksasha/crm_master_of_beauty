-- Deep improvements: audit, refresh tokens, cash shifts, sale refunds, appointment reminders

CREATE TYPE "SaleStatus" AS ENUM ('PAID', 'REFUNDED');
CREATE TYPE "CashShiftStatus" AS ENUM ('OPEN', 'CLOSED');
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'STATUS', 'PAYMENT', 'REFUND', 'LOGIN', 'LOGOUT', 'OTHER');

CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL DEFAULT 'OTHER',
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "meta" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE TABLE "CashShift" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "cashierId" TEXT NOT NULL,
    "status" "CashShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openingFloat" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "closingCash" DECIMAL(12,2),
    "expectedCash" DECIMAL(12,2),
    "difference" DECIMAL(12,2),
    "notes" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CashShift_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashShift_branchId_status_idx" ON "CashShift"("branchId", "status");
CREATE INDEX "CashShift_cashierId_idx" ON "CashShift"("cashierId");
CREATE INDEX "CashShift_openedAt_idx" ON "CashShift"("openedAt");

ALTER TABLE "Appointment" ADD COLUMN "reminder24hSentAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "reminder2hSentAt" TIMESTAMP(3);
ALTER TABLE "Appointment" ADD COLUMN "checkedInAt" TIMESTAMP(3);
CREATE INDEX "Appointment_reminder24hSentAt_startAt_idx" ON "Appointment"("reminder24hSentAt", "startAt");
CREATE INDEX "Appointment_reminder2hSentAt_startAt_idx" ON "Appointment"("reminder2hSentAt", "startAt");

ALTER TABLE "Sale" ADD COLUMN "cashShiftId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "status" "SaleStatus" NOT NULL DEFAULT 'PAID';
ALTER TABLE "Sale" ADD COLUMN "refundedAt" TIMESTAMP(3);
ALTER TABLE "Sale" ADD COLUMN "refundReason" TEXT;
ALTER TABLE "Sale" ADD COLUMN "refundedById" TEXT;
CREATE INDEX "Sale_status_idx" ON "Sale"("status");
CREATE INDEX "Sale_cashShiftId_idx" ON "Sale"("cashShiftId");

ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashShift" ADD CONSTRAINT "CashShift_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_cashShiftId_fkey" FOREIGN KEY ("cashShiftId") REFERENCES "CashShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_refundedById_fkey" FOREIGN KEY ("refundedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
