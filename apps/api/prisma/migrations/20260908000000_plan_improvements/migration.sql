-- Plan improvements: security, fiscal, telegram, marketing, inventory, commissions

CREATE TYPE "ShiftSwapStatus" AS ENUM ('PENDING', 'PEER_ACCEPTED', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "FiscalReceiptType" AS ENUM ('SELL', 'RETURN');
CREATE TYPE "FiscalReceiptStatus" AS ENUM ('PENDING', 'DONE', 'ERROR');
CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('OPEN', 'PAID', 'VOID');

ALTER TABLE "Salon"
  ADD COLUMN "checkboxEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "checkboxLicenseKey" TEXT,
  ADD COLUMN "checkboxPinCode" TEXT,
  ADD COLUMN "telegramBotToken" TEXT,
  ADD COLUMN "telegramEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "birthdayBonusPoints" INTEGER NOT NULL DEFAULT 150,
  ADD COLUMN "winbackEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "StaffProfile"
  ADD COLUMN "productCommissionPct" DOUBLE PRECISION NOT NULL DEFAULT 10,
  ADD COLUMN "commissionTiers" JSONB,
  ADD COLUMN "telegramChatId" TEXT;

ALTER TABLE "Client"
  ADD COLUMN "telegramChatId" TEXT,
  ADD COLUMN "telegramOptIn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastWinbackAt" TIMESTAMP(3),
  ADD COLUMN "birthdayBonusYear" INTEGER;

ALTER TABLE "ClientPortalOtp"
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Appointment"
  ADD COLUMN "reviewSentAt" TIMESTAMP(3),
  ADD COLUMN "npsScore" INTEGER;

ALTER TABLE "CashShift"
  ADD COLUMN "fiscalShiftId" TEXT;

ALTER TABLE "Sale"
  ADD COLUMN "giftRedeem" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "giftCertificateId" TEXT,
  ADD COLUMN "packageId" TEXT,
  ADD COLUMN "packageSessionsBurned" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Product"
  ADD COLUMN "barcode" TEXT;

CREATE INDEX "Product_barcode_idx" ON "Product"("barcode");

ALTER TABLE "Sale" ADD CONSTRAINT "Sale_giftCertificateId_fkey" FOREIGN KEY ("giftCertificateId") REFERENCES "GiftCertificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "ClientPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FiscalReceipt" (
    "id" TEXT NOT NULL,
    "saleId" TEXT,
    "type" "FiscalReceiptType" NOT NULL DEFAULT 'SELL',
    "status" "FiscalReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "fiscalCode" TEXT,
    "taxUrl" TEXT,
    "qrUrl" TEXT,
    "shiftId" TEXT,
    "raw" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FiscalReceipt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FiscalReceipt_saleId_idx" ON "FiscalReceipt"("saleId");
CREATE INDEX "FiscalReceipt_status_idx" ON "FiscalReceipt"("status");
ALTER TABLE "FiscalReceipt" ADD CONSTRAINT "FiscalReceipt_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierInvoice" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "branchId" TEXT,
    "number" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierInvoice_supplierId_idx" ON "SupplierInvoice"("supplierId");
CREATE INDEX "SupplierInvoice_branchId_idx" ON "SupplierInvoice"("branchId");
CREATE INDEX "SupplierInvoice_receivedAt_idx" ON "SupplierInvoice"("receivedAt");
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SupplierInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL,
    CONSTRAINT "SupplierInvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierInvoiceLine_invoiceId_idx" ON "SupplierInvoiceLine"("invoiceId");
CREATE INDEX "SupplierInvoiceLine_productId_idx" ON "SupplierInvoiceLine"("productId");
ALTER TABLE "SupplierInvoiceLine" ADD CONSTRAINT "SupplierInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoiceLine" ADD CONSTRAINT "SupplierInvoiceLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON UPDATE CASCADE;

CREATE TABLE "ShiftSwap" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "peerId" TEXT NOT NULL,
    "dateFrom" TIMESTAMP(3) NOT NULL,
    "dateTo" TIMESTAMP(3) NOT NULL,
    "status" "ShiftSwapStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftSwap_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShiftSwap_requesterId_idx" ON "ShiftSwap"("requesterId");
CREATE INDEX "ShiftSwap_peerId_idx" ON "ShiftSwap"("peerId");
CREATE INDEX "ShiftSwap_status_idx" ON "ShiftSwap"("status");
ALTER TABLE "ShiftSwap" ADD CONSTRAINT "ShiftSwap_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "StaffProfile"("id") ON UPDATE CASCADE;
ALTER TABLE "ShiftSwap" ADD CONSTRAINT "ShiftSwap_peerId_fkey" FOREIGN KEY ("peerId") REFERENCES "StaffProfile"("id") ON UPDATE CASCADE;
ALTER TABLE "ShiftSwap" ADD CONSTRAINT "ShiftSwap_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MarketingVoucher" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "discountPct" INTEGER NOT NULL DEFAULT 10,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "redeemedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "channel" TEXT NOT NULL DEFAULT 'sms',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketingVoucher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingVoucher_code_key" ON "MarketingVoucher"("code");
CREATE INDEX "MarketingVoucher_clientId_idx" ON "MarketingVoucher"("clientId");
CREATE INDEX "MarketingVoucher_type_idx" ON "MarketingVoucher"("type");
ALTER TABLE "MarketingVoucher" ADD CONSTRAINT "MarketingVoucher_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
