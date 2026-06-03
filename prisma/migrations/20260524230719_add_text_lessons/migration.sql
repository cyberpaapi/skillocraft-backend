-- CreateEnum
CREATE TYPE "LessonType" AS ENUM ('VIDEO', 'TEXT', 'BOTH');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "lessonType" "LessonType" NOT NULL DEFAULT 'VIDEO',
ADD COLUMN     "textContent" TEXT,
ALTER COLUMN "videoLink" DROP NOT NULL;
