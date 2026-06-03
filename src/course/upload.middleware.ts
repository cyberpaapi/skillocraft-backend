import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import uploadConfig from '../config/upload.config';

// Ensure upload directory exists
const ensureUploadsDir = (): void => {
  if (!fs.existsSync(uploadConfig.uploadDir)) {
    fs.mkdirSync(uploadConfig.uploadDir, { recursive: true });
  }
};

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadsDir();
    cb(null, uploadConfig.uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `product-${uniqueSuffix}${ext}`);
  },
});

// File filter to check file types
const fileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  if (uploadConfig.allowedFileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only ${uploadConfig.allowedFileTypes.join(', ')} are allowed.`));
  }
};

// Configure multer upload
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: uploadConfig.maxFileSize,
  },
});

// Middleware for handling single file uploads
export const uploadVideo = upload.single('video');

// Generate public URL for the uploaded file
export const generatePublicUrl = (filename: string): string => {
  return uploadConfig.getPublicUrl('course', path.basename(filename));
};

// Delete file from uploads directory
export const deleteFile = (filename: string): void => {
  const filePath = path.join(uploadConfig.uploadDir, path.basename(filename));
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
};

// Get file extension
export const getFileExtension = (filename: string): string => {
  return path.extname(filename).toLowerCase();
};

// Generate a unique filename
export const generateUniqueFilename = (originalname: string): string => {
  const ext = getFileExtension(originalname);
  return `product-${uuidv4()}${ext}`;
};
