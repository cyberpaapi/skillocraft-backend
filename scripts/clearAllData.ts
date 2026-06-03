import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearAllData() {
  try {
    console.log('🚀 Starting to clear all data...');
    
    // Disable foreign key checks for PostgreSQL
    await prisma.$executeRaw`SET session_replication_role = 'replica';`;
    
    // Get all table names from the database
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
    `;

    // Delete data from all tables in the correct order
    const tableOrder = [
      // User-related tables
      'Token',
      'Wishlist',
      'OrderItem',
      'Orders',
      'Cart',
      'Address',
      'User',
      
      // Content-related tables
      'Review',
      'VideoAnalytics',
      'Product',
      'CourseFAQ',
      'Course',
      'Author',
      'Creators',
      'SuccessStory',
      'Blog',
      'Category',
      
      // Feature content
      'FeatureGallery',
      'FeatureOn',
      
      // System tables
      'DiscountCoupon',
      'GeneralFAQ',
      'Banner',
      'Testimonials',
      'StaffAccess',
      'StaffRole',
      'refer',
      'Referal',
      
      // Any other tables that might have been missed
      ...tables
        .map(t => t.tablename)
        .filter(name => ![
          'Token', 'Wishlist', 'OrderItem', 'Orders', 'Cart', 'Address', 'User',
          'Review', 'VideoAnalytics', 'Product', 'CourseFAQ', 'Course', 'Author',
          'Creators', 'SuccessStory', 'Blog', 'Category', 'FeatureGallery',
          'FeatureOn', 'DiscountCoupon', 'GeneralFAQ', 'Banner', 'Testimonials',
          'StaffAccess', 'StaffRole', 'refer', 'Referal', 'migrations', '_prisma_migrations',
          'pg_stat_statements', 'pg_stat_statements_info', 'pg_stat_statements_info'
        ].includes(name))
    ];

    // Remove duplicates while preserving order
    const uniqueTables = Array.from(new Set(tableOrder));
    
    // Delete data from each table
    for (const table of uniqueTables) {
      try {
        // Skip if table doesn't exist in the actual database
        if (!tables.some(t => t.tablename === table)) continue;
        
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
        console.log(`✅ Cleared table: ${table}`);
      } catch (error) {
        console.error(`❌ Error clearing table ${table}:`, error);
      }
    }
    
    // Re-enable foreign key checks
    await prisma.$executeRaw`SET session_replication_role = 'origin';`;
    
    console.log('\n🎉 All data cleared successfully!');
  } catch (error) {
    console.error('❌ Error clearing data:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clearAllData();
