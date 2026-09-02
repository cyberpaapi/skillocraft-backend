-- Reusable language list for the admin audio-track dropdown
CREATE TABLE "Language" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Language_name_key" ON "Language"("name");

-- Alternate-language audio tracks for a lesson
CREATE TABLE "ProductAudioTrack" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "audioLink" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAudioTrack_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductAudioTrack_productId_idx" ON "ProductAudioTrack"("productId");

-- One track per language per lesson. This is what makes a duplicate language
-- impossible even if two admins submit at the same moment.
CREATE UNIQUE INDEX "ProductAudioTrack_productId_language_key"
    ON "ProductAudioTrack"("productId", "language");

ALTER TABLE "ProductAudioTrack"
    ADD CONSTRAINT "ProductAudioTrack_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed a few common starting points; admins can add more from the UI.
INSERT INTO "Language" ("id", "name", "code") VALUES
    (gen_random_uuid()::text, 'Hindi', 'hi'),
    (gen_random_uuid()::text, 'English', 'en'),
    (gen_random_uuid()::text, 'Marathi', 'mr'),
    (gen_random_uuid()::text, 'Gujarati', 'gu'),
    (gen_random_uuid()::text, 'Tamil', 'ta'),
    (gen_random_uuid()::text, 'Telugu', 'te'),
    (gen_random_uuid()::text, 'Bengali', 'bn'),
    (gen_random_uuid()::text, 'Kannada', 'kn'),
    (gen_random_uuid()::text, 'Punjabi', 'pa')
ON CONFLICT ("name") DO NOTHING;
