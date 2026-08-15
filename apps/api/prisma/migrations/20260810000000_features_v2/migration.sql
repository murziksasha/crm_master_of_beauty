-- CreateEnum
CREATE TYPE "WaitlistStatus" AS ENUM ('WAITING', 'NOTIFIED', 'BOOKED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "RecurringFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');
CREATE TYPE "OnlinePaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILURE', 'REVERSED');
CREATE TYPE "SmsProvider" AS ENUM ('MOCK', 'TURBOSMS', 'ALPHASMS');

-- AlterEnum PaymentMethod
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'LIQPAY';

-- Salon integrations
ALTER TABLE "Salon" ADD COLUMN IF NOT EXISTS "smsProvider" "SmsProvider" NOT NULL DEFAULT 'MOCK';
ALTER TABLE "Salon" ADD COLUMN IF NOT EXISTS "smsSender" TEXT;
ALTER TABLE "Salon" ADD COLUMN IF NOT EXISTS "smsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Salon" ADD COLUMN IF NOT EXISTS "liqpayPublicKey" TEXT;
ALTER TABLE "Salon" ADD COLUMN IF NOT EXISTS "liqpayPrivateKey" TEXT;
ALTER TABLE "Salon" ADD COLUMN IF NOT EXISTS "liqpaySandbox" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Salon" ADD COLUMN IF NOT EXISTS "liqpayEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Salon" ADD COLUMN IF NOT EXISTS "publicBaseUrl" TEXT;

-- Branch
CREATE TABLE IF NOT EXISTS "Branch" (
    "id" TEXT NOT NULL,
    "salonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "workingHours" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Branch_slug_key" ON "Branch"("slug");
CREATE INDEX IF NOT EXISTS "Branch_salonId_idx" ON "Branch"("salonId");
CREATE INDEX IF NOT EXISTS "Branch_isActive_idx" ON "Branch"("isActive");
ALTER TABLE "Branch" DROP CONSTRAINT IF EXISTS "Branch_salonId_fkey";
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_salonId_fkey" FOREIGN KEY ("salonId") REFERENCES "Salon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default branches from existing salons
INSERT INTO "Branch" ("id", "salonId", "name", "slug", "address", "phone", "email", "isActive", "isDefault", "workingHours", "sortOrder", "createdAt", "updatedAt")
SELECT
  'branch_default_' || s."id",
  s."id",
  s."name" || ' — Хрещатик',
  'khreshchatyk',
  s."address",
  s."phone",
  s."email",
  true,
  true,
  s."workingHours",
  0,
  NOW(),
  NOW()
FROM "Salon" s
WHERE NOT EXISTS (SELECT 1 FROM "Branch" b WHERE b."salonId" = s."id");

INSERT INTO "Branch" ("id", "salonId", "name", "slug", "address", "phone", "email", "isActive", "isDefault", "workingHours", "sortOrder", "createdAt", "updatedAt")
SELECT
  'branch_podil_' || s."id",
  s."id",
  s."name" || ' — Поділ',
  'podil',
  'м. Київ, вул. Сагайдачного, 22',
  s."phone",
  s."email",
  true,
  false,
  s."workingHours",
  1,
  NOW(),
  NOW()
FROM "Salon" s
WHERE NOT EXISTS (SELECT 1 FROM "Branch" b WHERE b."slug" = 'podil');

-- StaffProfile.branchId
ALTER TABLE "StaffProfile" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
CREATE INDEX IF NOT EXISTS "StaffProfile_branchId_idx" ON "StaffProfile"("branchId");
UPDATE "StaffProfile" sp
SET "branchId" = (SELECT b."id" FROM "Branch" b WHERE b."isDefault" = true LIMIT 1)
WHERE sp."branchId" IS NULL;
ALTER TABLE "StaffProfile" DROP CONSTRAINT IF EXISTS "StaffProfile_branchId_fkey";
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RecurringSeries
CREATE TABLE IF NOT EXISTS "RecurringSeries" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "clientId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "serviceIds" TEXT[],
    "frequency" "RecurringFrequency" NOT NULL DEFAULT 'WEEKLY',
    "interval" INTEGER NOT NULL DEFAULT 1,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "occurrences" INTEGER NOT NULL DEFAULT 8,
    "timeOfDay" TEXT NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecurringSeries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RecurringSeries_clientId_idx" ON "RecurringSeries"("clientId");
CREATE INDEX IF NOT EXISTS "RecurringSeries_staffId_idx" ON "RecurringSeries"("staffId");
CREATE INDEX IF NOT EXISTS "RecurringSeries_branchId_idx" ON "RecurringSeries"("branchId");
ALTER TABLE "RecurringSeries" DROP CONSTRAINT IF EXISTS "RecurringSeries_branchId_fkey";
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RecurringSeries" DROP CONSTRAINT IF EXISTS "RecurringSeries_clientId_fkey";
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecurringSeries" DROP CONSTRAINT IF EXISTS "RecurringSeries_staffId_fkey";
ALTER TABLE "RecurringSeries" ADD CONSTRAINT "RecurringSeries_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Appointment branch + series
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN IF NOT EXISTS "seriesId" TEXT;
CREATE INDEX IF NOT EXISTS "Appointment_branchId_idx" ON "Appointment"("branchId");
CREATE INDEX IF NOT EXISTS "Appointment_seriesId_idx" ON "Appointment"("seriesId");
UPDATE "Appointment" a
SET "branchId" = (SELECT b."id" FROM "Branch" b WHERE b."isDefault" = true LIMIT 1)
WHERE a."branchId" IS NULL;
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_branchId_fkey";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Appointment" DROP CONSTRAINT IF EXISTS "Appointment_seriesId_fkey";
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "RecurringSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Waitlist
CREATE TABLE IF NOT EXISTS "WaitlistEntry" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "clientId" TEXT NOT NULL,
    "serviceId" TEXT,
    "staffId" TEXT,
    "preferredDate" TIMESTAMP(3),
    "preferredTimeFrom" TEXT,
    "preferredTimeTo" TEXT,
    "notes" TEXT,
    "status" "WaitlistStatus" NOT NULL DEFAULT 'WAITING',
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WaitlistEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WaitlistEntry_status_idx" ON "WaitlistEntry"("status");
CREATE INDEX IF NOT EXISTS "WaitlistEntry_branchId_idx" ON "WaitlistEntry"("branchId");
CREATE INDEX IF NOT EXISTS "WaitlistEntry_clientId_idx" ON "WaitlistEntry"("clientId");
CREATE INDEX IF NOT EXISTS "WaitlistEntry_preferredDate_idx" ON "WaitlistEntry"("preferredDate");
ALTER TABLE "WaitlistEntry" DROP CONSTRAINT IF EXISTS "WaitlistEntry_branchId_fkey";
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" DROP CONSTRAINT IF EXISTS "WaitlistEntry_clientId_fkey";
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" DROP CONSTRAINT IF EXISTS "WaitlistEntry_serviceId_fkey";
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WaitlistEntry" DROP CONSTRAINT IF EXISTS "WaitlistEntry_staffId_fkey";
ALTER TABLE "WaitlistEntry" ADD CONSTRAINT "WaitlistEntry_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "StaffProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sale branch
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
CREATE INDEX IF NOT EXISTS "Sale_branchId_idx" ON "Sale"("branchId");
UPDATE "Sale" s
SET "branchId" = (SELECT b."id" FROM "Branch" b WHERE b."isDefault" = true LIMIT 1)
WHERE s."branchId" IS NULL;
ALTER TABLE "Sale" DROP CONSTRAINT IF EXISTS "Sale_branchId_fkey";
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Product branch
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "branchId" TEXT;
CREATE INDEX IF NOT EXISTS "Product_branchId_idx" ON "Product"("branchId");
UPDATE "Product" p
SET "branchId" = (SELECT b."id" FROM "Branch" b WHERE b."isDefault" = true LIMIT 1)
WHERE p."branchId" IS NULL;
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_branchId_fkey";
ALTER TABLE "Product" ADD CONSTRAINT "Product_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- OnlinePayment
CREATE TABLE IF NOT EXISTS "OnlinePayment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "clientId" TEXT,
    "appointmentId" TEXT,
    "saleId" TEXT,
    "orderId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "description" TEXT NOT NULL,
    "status" "OnlinePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL DEFAULT 'liqpay',
    "liqpayPaymentId" TEXT,
    "rawCallback" JSONB,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OnlinePayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OnlinePayment_appointmentId_key" ON "OnlinePayment"("appointmentId");
CREATE UNIQUE INDEX IF NOT EXISTS "OnlinePayment_saleId_key" ON "OnlinePayment"("saleId");
CREATE UNIQUE INDEX IF NOT EXISTS "OnlinePayment_orderId_key" ON "OnlinePayment"("orderId");
CREATE INDEX IF NOT EXISTS "OnlinePayment_status_idx" ON "OnlinePayment"("status");
CREATE INDEX IF NOT EXISTS "OnlinePayment_orderId_idx" ON "OnlinePayment"("orderId");
ALTER TABLE "OnlinePayment" DROP CONSTRAINT IF EXISTS "OnlinePayment_branchId_fkey";
ALTER TABLE "OnlinePayment" ADD CONSTRAINT "OnlinePayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnlinePayment" DROP CONSTRAINT IF EXISTS "OnlinePayment_clientId_fkey";
ALTER TABLE "OnlinePayment" ADD CONSTRAINT "OnlinePayment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnlinePayment" DROP CONSTRAINT IF EXISTS "OnlinePayment_appointmentId_fkey";
ALTER TABLE "OnlinePayment" ADD CONSTRAINT "OnlinePayment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OnlinePayment" DROP CONSTRAINT IF EXISTS "OnlinePayment_saleId_fkey";
ALTER TABLE "OnlinePayment" ADD CONSTRAINT "OnlinePayment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- SmsLog
CREATE TABLE IF NOT EXISTS "SmsLog" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SmsLog_createdAt_idx" ON "SmsLog"("createdAt");
CREATE INDEX IF NOT EXISTS "SmsLog_to_idx" ON "SmsLog"("to");
