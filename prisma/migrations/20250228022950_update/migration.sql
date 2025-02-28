/*
  Warnings:

  - Added the required column `link` to the `AI_Tool` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AI_Tool" ADD COLUMN     "link" TEXT NOT NULL;
