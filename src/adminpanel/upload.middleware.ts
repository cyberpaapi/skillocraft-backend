import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadPaths } from '../config/upload.config';

// Get category upload configuration
const categoryConfig = uploadPaths.category;

// Ensure upload directory exists for category images
const ensureCategoryUploadsDir = (): void => {
  if (!fs.existsSync(categoryConfig.dir)) {
    fs.mkdirSync(categoryConfig.dir, { recursive: true });
  }
};

// Configure multer storage for category images
const categoryStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureCategoryUploadsDir();
    cb(null, categoryConfig.dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `category-${uniqueSuffix}${ext}`);
  },
});

// File filter to allow only image files
const fileFilter: multer.Options['fileFilter'] = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  if (categoryConfig.allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Only image files (${categoryConfig.allowedTypes.join(', ')}) are allowed.`));
  }
};

// Initialize multer with configuration
export const uploadCategoryImage = multer({
  storage: categoryStorage,
  fileFilter,
  limits: {
    fileSize: categoryConfig.maxSize,
  },
});

// Generate public URL for the uploaded category image
export const generateCategoryImageUrl = (filename: string): string => {
  return `${categoryConfig.publicPath}/${filename}`;
};

// Delete category image file
export const deleteCategoryImage = (imageUrl: string): void => {
  if (!imageUrl) return;
  
  try {
    const filename = path.basename(imageUrl);
    const filePath = path.join(categoryConfig.dir, filename);
    
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error deleting category image:', error);
  }
};
