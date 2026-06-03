import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// Add error handling
prisma.$connect()
  .then(() => console.log('Connected to database'))
  .catch((error: any) => {
    console.error('Failed to connect to database:', error);
    process.exit(1);
  });

export default prisma;