/*
  Warnings:

  - You are about to drop the `AI_Tool_Pricing` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AI_Tool_Pricing" DROP CONSTRAINT "AI_Tool_Pricing_toolId_fkey";

-- AlterTable
ALTER TABLE "AI_Tool" ADD COLUMN     "free" BOOLEAN,
ADD COLUMN     "pro" BOOLEAN,
ADD COLUMN     "pro_price" TEXT;

-- DropTable
DROP TABLE "AI_Tool_Pricing";
