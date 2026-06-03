import { Request, Response } from 'express';
import { exec } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import { promisify } from 'util';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const execAsync = promisify(exec);

// File extensions to delete (add more as needed)
const FILE_EXTENSIONS_TO_DELETE = [
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp',
  // Videos
  '.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv',
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  // Audio
  '.mp3', '.wav', '.ogg', '.m4a',
  // Archives
  '.zip', '.rar', '.7z', '.tar', '.gz'
];

/**
 * Recursively deletes all files with specified extensions in a directory
 * while preserving the directory structure
 */
async function clearUploadedFiles(directory: string): Promise<{ deleted: number; errors: number }> {
  let deleted = 0;
  let errors = 0;
  
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively process subdirectories
        const result = await clearUploadedFiles(fullPath);
        deleted += result.deleted;
        errors += result.errors;
      } else if (entry.isFile()) {
        // Check if file extension matches our list
        const ext = path.extname(entry.name).toLowerCase();
        if (FILE_EXTENSIONS_TO_DELETE.includes(ext)) {
          try {
            await fs.unlink(fullPath);
            console.log(`Deleted: ${fullPath}`);
            deleted++;
          } catch (error) {
            console.error(`Error deleting ${fullPath}:`, error);
            errors++;
          }
        }
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${directory}:`, error);
    errors++;
  }
  
  return { deleted, errors };
}

// Check if the user is an admin
const isAdmin = async (userId: string): Promise<boolean> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });
    return user?.role === 'ADMIN';
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
};

// Verify admin token from Authorization header
const verifyAdminToken = (token: string): { userId: string } | null => {
  try {
    const secret = process.env.ADMIN_SECRET_KEY || 'your-super-secure-admin-secret';
    return jwt.verify(token, secret) as { userId: string };
  } catch (error) {
    return null;
  }
};

/**
 * @swagger
 * /api/admin/clear-database:
 *   post:
 *     summary: Clear the entire database (Development only)
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Database cleared successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       403:
 *         description: Forbidden - Operation not allowed in production
 *       500:
 *         description: Error clearing database
 */
export const clearDatabase = async (req: Request, res: Response): Promise<void> => {
  // Check for admin token in production
  if (process.env.NODE_ENV === 'production') {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Admin authentication required',
      });
      return;
    }
    
    const decoded = verifyAdminToken(token);
    if (!decoded) {
      res.status(403).json({
        success: false,
        message: 'Invalid or expired admin token',
      });
      return;
    }
    
    // Verify user has admin role
    const userIsAdmin = await isAdmin(decoded.userId);
    if (!userIsAdmin) {
      res.status(403).json({
        success: false,
        message: 'Admin privileges required',
      });
      return;
    }
  }

  try {
    // Get the absolute path to the clearDatabase.ts script
    const scriptPath = path.join(process.cwd(), 'scripts/clearDatabase.ts');
    const uploadsPath = path.join(process.cwd(), 'uploads');
    
    console.log('Starting database and file cleanup...');
    
    // Clear the database first
    console.log(`Executing database clear script: ${scriptPath}`);
    const { stdout, stderr } = await execAsync(`npx ts-node ${scriptPath}`);
    
    if (stderr) {
      console.error('Error clearing database:', stderr);
      throw new Error(stderr);
    }
    
    console.log('Database cleared successfully');
    
    // Clear uploaded files
    console.log('Clearing uploaded files...');
    const clearResult = await clearUploadedFiles(uploadsPath);
    
    console.log('Cleanup completed:', {
      database: 'success',
      filesDeleted: clearResult.deleted,
      fileErrors: clearResult.errors
    });
    
    res.status(200).json({
      success: true,
      message: 'Database and uploaded files cleared successfully',
      details: {
        database: 'success',
        filesDeleted: clearResult.deleted,
        fileErrors: clearResult.errors,
        output: stdout
      },
    });
  } catch (error) {
    console.error('Error clearing database:', error);
    res.status(500).json({
      success: false,
      message: 'Error clearing database',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * @swagger
 * /api/admin/check-clear-database:
 *   get:
 *     summary: Check if clear database endpoint is available
 *     tags: [Admin]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Clear database endpoint is available
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 available:
 *                   type: boolean
 *                 environment:
 *                   type: string
 */
export const checkClearDatabase = async (req: Request, res: Response): Promise<void> => {
  // In production, require admin authentication
  if (process.env.NODE_ENV === 'production') {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      res.status(200).json({
        available: false,
        environment: 'production',
        message: 'Admin authentication required',
      });
      return;
    }
    
    const decoded = verifyAdminToken(token);
    if (!decoded) {
      res.status(200).json({
        available: false,
        environment: 'production',
        message: 'Invalid or expired admin token',
      });
      return;
    }
    
    // Verify user has admin role
    const userIsAdmin = await isAdmin(decoded.userId);
    if (!userIsAdmin) {
      res.status(200).json({
        available: false,
        environment: 'production',
        message: 'Admin privileges required',
      });
      return;
    }
  }
  
  res.status(200).json({
    available: true,
    environment: process.env.NODE_ENV || 'development',
    message: 'Clear database endpoint is available',
  });
};
