-- DropForeignKey
ALTER TABLE "Trek" DROP CONSTRAINT IF EXISTS "Trek_userId_fkey";

-- DropTable
DROP TABLE IF EXISTS "Trek";