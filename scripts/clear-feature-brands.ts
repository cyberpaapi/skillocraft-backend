import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function clearFeatureBrands() {
  console.log('Starting to clear FeatureOn table...');
  
  try {
    // Delete all records from FeatureOn table
    const result = await prisma.featureOn.deleteMany({});
    
    console.log(`✅ Cleared ${result.count} records from FeatureOn table`);
    return result.count;
  } catch (error) {
    console.error('❌ Error clearing FeatureOn table:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  clearFeatureBrands()
    .then(() => {
      console.log('✅ Feature brands cleared successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Failed to clear feature brands:', error);
      process.exit(1);
    });
}

export { clearFeatureBrands };
