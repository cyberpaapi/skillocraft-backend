import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import uploadConfig from '../config/upload.config';

// Ensure uploads directory exists
const ensureUploadsDir = (): void => {
  if (!fs.existsSync(uploadConfig.uploadDir)) {
    fs.mkdirSync(uploadConfig.uploadDir, { recursive: true });
  }
};

// Configure multer storage for testimonial images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(uploadConfig.uploadDir, 'images/testimonials');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `testimonial-${uniqueSuffix}${ext}`);
  },
});

// File filter to allow only image files
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'image/webp',
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, JPG, WEBP) are allowed.'));
  }
};

// Configure multer upload
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit for testimonial images
  },
});

// Middleware for handling single image upload
export const uploadTestimonialImage = upload.single('image');

// Generate public URL for the uploaded testimonial image
export const generateTestimonialUrl = (filename: string): string => {
  return `/uploads/images/testimonials/${filename}`;
};

// Delete testimonial image file
export const deleteTestimonialImage = (imageUrl: string): void => {
  if (!imageUrl) return;
  
  const filename = path.basename(imageUrl);
  const filePath = path.join(uploadConfig.uploadDir, 'testimonials', filename);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

// Middleware to check if user is admin
export const isAdmin = (req: any, res: any, next: any) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
};
