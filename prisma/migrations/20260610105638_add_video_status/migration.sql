-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "videoStatus" TEXT NOT NULL DEFAULT 'idle';

-- CreateTable
CREATE TABLE "ReferralSettings" (
    "id" TEXT NOT NULL DEFAULT 'SINGLETON',
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "earningsPercent" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReferralSettings_pkey" PRIMARY KEY ("id")
);
