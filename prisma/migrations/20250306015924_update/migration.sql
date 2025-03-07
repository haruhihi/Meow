/*
  Warnings:

  - A unique constraint covering the columns `[id]` on the table `AI_Tool` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `category1` to the `AI_Tool` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AI_Tool" ADD COLUMN     "category1" TEXT NOT NULL,
ADD COLUMN     "category2" TEXT,
ADD COLUMN     "registration" BOOLEAN,
ADD COLUMN     "tags" TEXT[],
ALTER COLUMN "icon" DROP NOT NULL;

-- CreateTable
CREATE TABLE "AI_Tool_Pricing" (
    "id" SERIAL NOT NULL,
    "toolId" TEXT NOT NULL,
    "free" BOOLEAN,
    "pro" BOOLEAN,
    "pro_price" TEXT,

    CONSTRAINT "AI_Tool_Pricing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AI_Tool_Pricing_id_key" ON "AI_Tool_Pricing"("id");

-- CreateIndex
CREATE UNIQUE INDEX "AI_Tool_Pricing_toolId_key" ON "AI_Tool_Pricing"("toolId");

-- CreateIndex
CREATE UNIQUE INDEX "AI_Tool_id_key" ON "AI_Tool"("id");

-- AddForeignKey
ALTER TABLE "AI_Tool_Pricing" ADD CONSTRAINT "AI_Tool_Pricing_toolId_fkey" FOREIGN KEY ("toolId") REFERENCES "AI_Tool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
