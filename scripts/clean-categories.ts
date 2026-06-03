import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

async function cleanAllData() {
  try {
    console.log('Starting data cleanup...');

    // 1. First, get all subcategories with their image URLs
    console.log('Fetching subcategories...');
    const subcategories = await prisma.subCategory.findMany({
      select: {
        id: true,
        name: true,
        ImageUrl: true
      }
    });

    // 2. Get all categories with their image URLs
    console.log('Fetching categories...');
    const categories = await prisma.category.findMany({
      select: {
        id: true,
        name: true,
        ImageUrl: true
      }
    });

    console.log(`Found ${categories.length} categories and ${subcategories.length} subcategories to clean up`);

    // 3. Delete all subcategories first (due to foreign key constraints)
    console.log('Deleting subcategories...');
    const deleteSubcategoriesResult = await prisma.subCategory.deleteMany({});
    console.log(`Deleted ${deleteSubcategoriesResult.count} subcategories`);

    // 4. Delete all categories
    console.log('Deleting categories...');
    const deleteCategoriesResult = await prisma.category.deleteMany({});
    console.log(`Deleted ${deleteCategoriesResult.count} categories`);

    // 5. Clean up category image files
    console.log('Cleaning up category images...');
    for (const category of categories) {
      if (category.ImageUrl) {
        try {
          const filename = path.basename(category.ImageUrl);
          const imagePath = path.join(process.cwd(), 'uploads', 'images', 'categories', filename);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log(`✓ Deleted image for category: ${category.name}`);
          }
        } catch (error) {
          console.error(`Error deleting image for category ${category.name}:`, error);
        }
      }
    }

    // 6. Clean up subcategory image files
    console.log('Cleaning up subcategory images...');
    for (const subcategory of subcategories) {
      if (subcategory.ImageUrl) {
        try {
          const filename = path.basename(subcategory.ImageUrl);
          const imagePath = path.join(process.cwd(), 'uploads', 'images', 'categories', filename);
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
            console.log(`✓ Deleted image for subcategory: ${subcategory.name}`);
          }
        } catch (error) {
          console.error(`Error deleting image for subcategory ${subcategory.name}:`, error);
        }
      }
    }

    console.log('✅ Data cleanup completed successfully');
  } catch (error) {
    console.error('❌ Error during data cleanup:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanAllData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
