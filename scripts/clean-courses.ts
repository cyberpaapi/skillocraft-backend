import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function cleanCourses() {
  try {
    console.log('🚀 Starting course cleanup process...');
    
    // Delete all courses from the database
    console.log('Deleting all courses from the database...');
    const deleteResult = await prisma.course.deleteMany({});
    
    console.log(`✅ Successfully deleted ${deleteResult.count} courses from the database.`);
    console.log('✅ Course cleanup completed successfully.');
    return deleteResult.count;
  } catch (error) {
    console.error('❌ Error cleaning up courses:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanCourses()
  .then((count) => {
    console.log(`✅ Successfully cleaned up ${count} courses.`);
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
