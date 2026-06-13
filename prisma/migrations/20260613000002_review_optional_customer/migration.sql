-- AlterTable: make customerId optional and add reviewerName
ALTER TABLE "Review" ALTER COLUMN "customerId" DROP NOT NULL;
ALTER TABLE "Review" ADD COLUMN "reviewerName" TEXT;
