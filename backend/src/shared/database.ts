import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export function createDatabase(url: string) {
  const adapter = new PrismaPg({ connectionString: url });
  const prisma = new PrismaClient({ adapter });

  return {
    prisma,
    async check() {
      await prisma.$queryRaw`SELECT 1`;
    },
    close() {
      return prisma.$disconnect();
    },
  };
}
