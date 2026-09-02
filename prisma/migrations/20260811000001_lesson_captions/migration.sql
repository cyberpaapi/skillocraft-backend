-- Lesson caption (CC) support
ALTER TABLE "Product" ADD COLUMN "captionStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Product" ADD COLUMN "captionLink" TEXT;
ALTER TABLE "Product" ADD COLUMN "captionError" TEXT;
ALTER TABLE "Product" ADD COLUMN "captionUpdatedAt" TIMESTAMP(3);

-- Lessons that already have captions elsewhere stay 'none' until generated.
CREATE INDEX "Product_captionStatus_idx" ON "Product"("captionStatus");
