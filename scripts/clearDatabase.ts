import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function clearDatabase() {
  console.log('Starting database cleanup...');
  
  // Disable foreign key checks temporarily
  await prisma.$executeRaw`SET session_replication_role = 'replica'`;
  
  try {
    // Get all table names from the database
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `;

    // Delete data from all tables
    for (const { tablename } of tables) {
      console.log(`Clearing table: ${tablename}`);
      try {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${tablename}" CASCADE`);
        console.log(`✅ Successfully cleared ${tablename}`);
      } catch (error) {
        console.error(`❌ Error clearing ${tablename}:`, error);
      }
    }

    console.log('✅ Database cleared successfully!');
  } catch (error) {
    console.error('❌ Error clearing database:', error);
  } finally {
    // Re-enable foreign key checks
    await prisma.$executeRaw`SET session_replication_role = 'origin'`;
    await prisma.$disconnect();
  }
}

clearDatabase()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
