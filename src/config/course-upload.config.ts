import path from 'path';
import fs from 'fs';

// Define upload directory
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'images', 'courses');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export default {
  uploadDir: UPLOAD_DIR,
  maxFileSize: 5 * 1024 * 1024, // 5MB
  allowedFileTypes: [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'image/gif',
    'image/webp'
  ],
  getPublicUrl: (filename: string) => {
    return `/uploads/images/courses/${filename}`;
  }
};
