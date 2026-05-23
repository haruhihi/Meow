import { PrismaClient } from '@prisma/client';
import { getAppDatabaseUrl } from './database-url';

const globalForPrisma = global as unknown as { prisma?: PrismaClient };

console.log('create prisma client');

export const prisma = globalForPrisma.prisma || new PrismaClient({
	datasources: {
		db: {
			url: getAppDatabaseUrl(),
		},
	},
});

globalForPrisma.prisma = prisma;

export * from '@prisma/client';
