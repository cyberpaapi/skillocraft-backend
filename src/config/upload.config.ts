import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

// Base upload directory
const BASE_UPLOAD_DIR = 'uploads';

// File size limits (in bytes)
const MAX_IMAGE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024 * 1024; // 50GB

// Allowed file types
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/svg+xml',  // SVG support
  'image/svg'        // Some browsers might use this MIME type
];

const ALLOWED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-ms-wmv',
  'video/x-matroska',
  'video/3gpp',
  'video/3gpp2',
  'video/mpeg',
  'video/ogg'
];

const ALLOWED_PDF_TYPES = [
  'application/pdf'
];

// Path configurations
export const uploadPaths = {
  banner: {
    dir: path.join(BASE_UPLOAD_DIR, 'images', 'banner'),
    publicPath: '/uploads/images/banner',
    maxSize: MAX_IMAGE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES
  },
  category: {
    dir: path.join(BASE_UPLOAD_DIR, 'images', 'categories'),
    publicPath: '/uploads/images/categories',
    maxSize: MAX_IMAGE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES
  },
  icon: {
    dir: path.join(BASE_UPLOAD_DIR, 'images', 'icons'),
    publicPath: '/uploads/images/icons',
    maxSize: MAX_IMAGE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES
  },
  subcategory: {
    dir: path.join(BASE_UPLOAD_DIR, 'images', 'categories'), // Same as category
    publicPath: '/uploads/images/categories',
    maxSize: MAX_IMAGE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES
  },
  course: {
    dir: path.join(BASE_UPLOAD_DIR, 'images', 'courses'),
    publicPath: '/uploads/images/courses',
    maxSize: MAX_IMAGE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES
  },
  productVideo: {
    dir: path.join(BASE_UPLOAD_DIR, 'videos', 'products'),
    publicPath: '/uploads/videos/products',
    maxSize: MAX_VIDEO_SIZE,
    allowedTypes: ALLOWED_VIDEO_TYPES
  },
  courseTeaserVideo: {
    dir: path.join(BASE_UPLOAD_DIR, 'videos', 'courses'),
    publicPath: '/uploads/videos/courses',
    maxSize: MAX_VIDEO_SIZE,
    allowedTypes: ALLOWED_VIDEO_TYPES
  },
  featureBrand: {
    dir: path.join(BASE_UPLOAD_DIR, 'images', 'feature-brands'),
    publicPath: '/uploads/images/feature-brands',
    maxSize: MAX_IMAGE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES
  },
  featureGallery: {
    dir: path.join(BASE_UPLOAD_DIR, 'images', 'feature-gallery'),
    publicPath: '/uploads/images/feature-gallery',
    maxSize: MAX_IMAGE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES
  },
  blog: {
    dir: path.join(BASE_UPLOAD_DIR, 'images', 'blogs'),
    publicPath: '/uploads/images/blogs',
    maxSize: MAX_IMAGE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES
  },
  author: {
    dir: path.join(BASE_UPLOAD_DIR, 'images', 'author'),
    publicPath: '/uploads/images/author',
    maxSize: MAX_IMAGE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES
  },
  creator: {
    dir: path.join(BASE_UPLOAD_DIR, 'images', 'creator'),
    publicPath: '/uploads/images/creator',
    maxSize: MAX_IMAGE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES
  },
  successImage: {
    dir: path.join(BASE_UPLOAD_DIR, 'images', 'success'),
    publicPath: '/uploads/images/success',
    maxSize: MAX_IMAGE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES
  },
  successCoverImage: {
    dir: path.join(BASE_UPLOAD_DIR, 'images', 'success'),
    publicPath: '/uploads/images/success',
    maxSize: MAX_IMAGE_SIZE,
    allowedTypes: ALLOWED_IMAGE_TYPES
  },
  coursePdf: {
    dir: path.join(BASE_UPLOAD_DIR, 'pdfs', 'courses'),
    publicPath: '/uploads/pdfs/courses',
    maxSize: 10 * 1024 * 1024, // 10MB for PDFs
    allowedTypes: ALLOWED_PDF_TYPES
  }
};

// Default export for backward compatibility
export default {
  uploadDir: path.join(process.cwd(), BASE_UPLOAD_DIR),
  maxFileSize: MAX_VIDEO_SIZE,
  allowedFileTypes: [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES],
  getPublicUrl: (type: keyof typeof uploadPaths, filename: string) => {
    return `${uploadPaths[type].publicPath}/${filename}`;
  },
  ...uploadPaths
};
