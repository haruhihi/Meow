import { PrismaClient } from '@prisma/client';

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

console.log('create prisma client');

export const prisma = globalForPrisma.prisma || new PrismaClient();

globalForPrisma.prisma = prisma;

export * from '@prisma/client';
