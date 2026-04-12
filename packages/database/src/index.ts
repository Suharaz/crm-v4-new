import { PrismaClient } from '@prisma/client';
import { softDeleteExtension } from './soft-delete-extension';

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

function createPrismaClient() {
  return new PrismaClient().$extends(softDeleteExtension);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Type for the extended client (with soft-delete extension)
export type ExtendedPrismaClient = typeof prisma;

export { PrismaClient };
export { softDeleteExtension } from './soft-delete-extension';
export * from '@prisma/client';
