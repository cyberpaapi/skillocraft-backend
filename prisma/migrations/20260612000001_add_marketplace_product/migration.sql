-- CreateTable
CREATE TABLE "MarketplaceProduct" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "price" TEXT NOT NULL,
    "originalPrice" TEXT NOT NULL DEFAULT '',
    "discount" TEXT NOT NULL DEFAULT '0',
    "category" TEXT NOT NULL,
    "images" TEXT[],
    "highlights" JSONB NOT NULL DEFAULT '[]',
    "specifications" TEXT,
    "importantNote" TEXT,
    "deliveryInfo" TEXT,
    "status" "ActiveStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceProduct_id_key" ON "MarketplaceProduct"("id");
