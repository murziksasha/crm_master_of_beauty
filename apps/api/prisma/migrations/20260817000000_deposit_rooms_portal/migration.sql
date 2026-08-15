-- Deposit settings, rooms, portal OTP, appointment deposit/room fields

ALTER TABLE "Salon" ADD COLUMN "depositEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Salon" ADD COLUMN "depositRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Salon" ADD COLUMN "depositPercent" DOUBLE PRECISION NOT NULL DEFAULT 30;

CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "color" TEXT NOT NULL DEFAULT '#A78BFA',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Room_branchId_idx" ON "Room"("branchId");
CREATE INDEX "Room_isActive_idx" ON "Room"("isActive");
ALTER TABLE "Room" ADD CONSTRAINT "Room_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ClientPortalOtp" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientPortalOtp_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ClientPortalOtp_clientId_idx" ON "ClientPortalOtp"("clientId");
CREATE INDEX "ClientPortalOtp_expiresAt_idx" ON "ClientPortalOtp"("expiresAt");
ALTER TABLE "ClientPortalOtp" ADD CONSTRAINT "ClientPortalOtp_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Appointment" ADD COLUMN "roomId" TEXT;
ALTER TABLE "Appointment" ADD COLUMN "depositAmount" DECIMAL(12,2);
ALTER TABLE "Appointment" ADD COLUMN "depositPaidAt" TIMESTAMP(3);
CREATE INDEX "Appointment_roomId_startAt_endAt_idx" ON "Appointment"("roomId", "startAt", "endAt");
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
