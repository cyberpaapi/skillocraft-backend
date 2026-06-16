import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import fs from 'fs';
import { uploadPaths } from '../config/upload.config';

// Temp directory for large video uploads — files land here before FFmpeg picks them up
const VIDEO_TEMP_DIR = path.join(process.cwd(), 'temp', 'uploads');
fs.mkdirSync(VIDEO_TEMP_DIR, { recursive: true });



// Ensure upload directories exist
// const ensureUploadDirs = (): void => {
//   // Ensure all upload directories exist
//   Object.values(uploadPaths).forEach(config => {
//     if (!fs.existsSync(config.dir)) {
//       fs.mkdirSync(config.dir, { recursive: true });
//     }
//   });
// };

// Configure multer storage for course images
// const courseImageStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     ensureUploadDirs();
//     cb(null, uploadPaths.course.dir);
//   },
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname).toLowerCase();
//     const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
//     cb(null, `course-${uniqueSuffix}${ext}`);
//   },
// });

// Configure multer storage for author images
// const authorImageStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     ensureUploadDirs();
//     cb(null, uploadPaths.author.dir);
//   },
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname).toLowerCase();
//     const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
//     cb(null, `author-${uniqueSuffix}${ext}`);
//   },
// });

// Configure multer storage for blog images
// const blogImageStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     ensureUploadDirs();
//     cb(null, uploadPaths.blog.dir);
//   },
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname).toLowerCase();
//     const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
//     cb(null, `blog-${uniqueSuffix}${ext}`);
//   },
// });

// Configure multer storage for creator images
// const creatorImageStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     ensureUploadDirs();
//     cb(null, uploadPaths.creator.dir);
//   },
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname).toLowerCase();
//     const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
//     cb(null, `creator-${uniqueSuffix}${ext}`);
//   },
// });

// File filter for images
const imageFileFilter: multer.Options['fileFilter'] = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  // Check if the file type is allowed in any of our image upload paths
  const isAllowedImageType = Object.values(uploadPaths).some(
    config => config.allowedTypes.includes(file.mimetype)
  );
  
  if (isAllowedImageType) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only image files are allowed.'));
  }
};

// Configure multer storage for videos
// const videoStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     ensureUploadDirs();
//     cb(null, uploadPaths.productVideo.dir);
//   },
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname).toLowerCase();
//     const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
//     cb(null, `video-${uniqueSuffix}${ext}`);
//   },
// });

// Configure multer storage for course teaser videos
// const courseTeaserVideoStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     ensureUploadDirs();
//     cb(null, uploadPaths.courseTeaserVideo.dir);
//   },
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname).toLowerCase();
//     const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
//     cb(null, `course-teaser-${uniqueSuffix}${ext}`);
//   },
// });

// File filter for videos
const videoFileFilter: multer.Options['fileFilter'] = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  // Check if the file type is allowed for both product videos and course teaser videos
  const isProductVideoAllowed = uploadPaths.productVideo.allowedTypes.includes(file.mimetype);
  const isCourseTeaserVideoAllowed = uploadPaths.courseTeaserVideo.allowedTypes.includes(file.mimetype);
  
  if (isProductVideoAllowed || isCourseTeaserVideoAllowed) {
    cb(null, true);
  } else {
    cb(new Error(`Only video files (${[...uploadPaths.productVideo.allowedTypes, ...uploadPaths.courseTeaserVideo.allowedTypes].join(', ')}) are allowed.`));
  }
};

const authorUpload = multer({
  storage: multer.memoryStorage(), // IMPORTANT
  fileFilter: imageFileFilter,
  limits: { fileSize: uploadPaths.author.maxSize },
});
export const uploadAuthorImage = authorUpload.single('image');

const courseImageUpload = multer({
  storage: multer.memoryStorage(), // IMPORTANT
  fileFilter: imageFileFilter,
  limits: { fileSize: uploadPaths.course.maxSize },
});
export const uploadCourseImage = courseImageUpload.single('image');

const blogUpload = multer({
  storage: multer.memoryStorage(), // IMPORTANT
  fileFilter: imageFileFilter,
  limits: { fileSize: uploadPaths.blog.maxSize },
});
export const uploadBlogImage = blogUpload.single('image');

const featureBrandStorageUpload = multer({
  storage: multer.memoryStorage(), // IMPORTANT
  fileFilter: imageFileFilter,
  limits: { fileSize: uploadPaths.featureBrand.maxSize },
});
export const uploadFeatureBrandImage = featureBrandStorageUpload.single('logo');

const featureGalleryStorageUpload = multer({
  storage: multer.memoryStorage(), // IMPORTANT
  fileFilter: imageFileFilter,
  limits: { fileSize: uploadPaths.featureGallery.maxSize },
});
export const uploadFeatureGalleryImage = featureGalleryStorageUpload.single('image');

const creatorImageStorageUpload = multer({
  storage: multer.memoryStorage(), // IMPORTANT
  fileFilter: imageFileFilter,
  limits: { fileSize: uploadPaths.creator.maxSize },
});
export const uploadCreatorImage = creatorImageStorageUpload.single('image');



export const uploadCategoryFiles = multer({
    storage: multer.memoryStorage(),
  // storage: multer.diskStorage({
  //   destination: (req, file, cb) => {
  //     ensureUploadDirs();
  //     const dest =
  //       file.fieldname === 'image'
  //         ? uploadPaths.category.dir
  //         : uploadPaths.icon.dir;
  //     cb(null, dest);
  //   },
  //   filename: (req, file, cb) => {
  //     const ext = path.extname(file.originalname).toLowerCase();
  //     const prefix = file.fieldname === 'image' ? 'category' : 'icon';
  //     const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  //     cb(null, `${prefix}-${uniqueSuffix}${ext}`);
  //   }
  // }),
  fileFilter: imageFileFilter,
  limits: { fileSize: uploadPaths.category.maxSize }
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'icon', maxCount: 1 }
]);

// Success story file upload configuration
export const uploadSuccessStoryFiles = multer({
  //storage: multer.diskStorage({
  storage: multer.memoryStorage(),
  // storage: multer.diskStorage({
  //   destination: (req, file, cb) => {
  //     ensureUploadDirs();
  //     const dest = file.fieldname === 'image' 
  //       ? uploadPaths.successImage.dir 
  //       : uploadPaths.successCoverImage.dir;
  //     cb(null, dest);
  //   },
  //   filename: (req, file, cb) => {
  //     const ext = path.extname(file.originalname).toLowerCase();
  //     const prefix = file.fieldname === 'image' ? 'success' : 'cover';
  //     const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  //     cb(null, `${prefix}-${uniqueSuffix}${ext}`);
  //   },
  // }),
  fileFilter: imageFileFilter,
  limits: { 
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'coverPhoto', maxCount: 1 }
]);

// export const uploadAuthorImage = multer({
//   storage: authorImageStorage,
//   fileFilter: imageFileFilter,
//   limits: { fileSize: uploadPaths.author.maxSize },
// }).single('image');

// export const uploadCourseImage = multer({
//   storage: courseImageStorage,
//   fileFilter: imageFileFilter,
//   limits: { fileSize: uploadPaths.course.maxSize },
// }).single('image');

export const uploadMarketplaceImages = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
}).fields([{ name: 'images', maxCount: 6 }]);

// File filter for PDFs
const pdfFileFilter: multer.Options['fileFilter'] = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  const allowedTypes = ['application/pdf'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF files are allowed.'));
  }
};

const eventImageUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});
export const uploadEventImage = eventImageUpload.single('image');

// export const uploadBlogImage = multer({
//   storage: blogImageStorage,
//   fileFilter: imageFileFilter,
//   limits: { fileSize: uploadPaths.blog.maxSize },
// }).single('featuredImage');

// Configure multer storage for feature brand images
// const featureBrandStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     ensureUploadDirs();
//     cb(null, uploadPaths.featureBrand.dir);
//   },
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname).toLowerCase();
//     const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
//     cb(null, `feature-brand-${uniqueSuffix}${ext}`);
//   },
// });

// Configure multer storage for feature gallery images
// const featureGalleryStorage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     ensureUploadDirs();
//     cb(null, uploadPaths.featureGallery.dir);
//   },
//   filename: (req, file, cb) => {
//     const ext = path.extname(file.originalname).toLowerCase();
//     const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
//     cb(null, `feature-gallery-${uniqueSuffix}${ext}`);
//   },
// });

// export const uploadCreatorImage = multer({
//   storage: creatorImageStorage,
//   fileFilter: imageFileFilter,
//   limits: { fileSize: uploadPaths.creator.maxSize },
// }).single('image');

// export const uploadFeatureBrandImage = multer({
//   storage: featureBrandStorage,
//   fileFilter: imageFileFilter,
//   limits: { fileSize: uploadPaths.featureBrand.maxSize },
// }).single('logo');

// export const uploadFeatureGalleryImage = multer({
//   storage: featureGalleryStorage,
//   fileFilter: imageFileFilter,
//   limits: { fileSize: uploadPaths.featureGallery.maxSize },
// }).single('image');
export const uploadCourseFiles = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    if (file.fieldname === 'image') {
      imageFileFilter(req, file, cb);
    } else if (file.fieldname === 'teaserVideo') {
      videoFileFilter(req, file, cb);
    } else if (file.fieldname === 'pdfFile') {
      pdfFileFilter(req, file, cb);
    } else {
      cb(new Error('Invalid field name'));
    }
  },
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB limit for all files
  }
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'teaserVideo', maxCount: 1 },
  { name: 'pdfFile', maxCount: 1 }
]);

// export const uploadVideo = multer({
//   storage: videoStorage,
//   fileFilter: videoFileFilter,
//   limits: { fileSize: uploadPaths.productVideo.maxSize },
// }).single('video');
const videoStorageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, VIDEO_TEMP_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `video-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
    },
  }),
  fileFilter: videoFileFilter,
  limits: { fileSize: uploadPaths.productVideo.maxSize },
});
export const uploadVideo = videoStorageUpload.single('video');

const courseTeaserVideoStorageUpload = multer({
  storage: multer.memoryStorage(), // IMPORTANT
  fileFilter: videoFileFilter,
  limits: { fileSize: uploadPaths.courseTeaserVideo.maxSize },
});
export const uploadCourseTeaserVideo = courseTeaserVideoStorageUpload.single('video');

// export const uploadCourseTeaserVideo = multer({
//   storage: courseTeaserVideoStorage,
//   fileFilter: videoFileFilter,
//   limits: { fileSize: uploadPaths.courseTeaserVideo.maxSize },
// }).single('teaserVideo');

// Course download file upload (any file type, up to 50MB)
export const uploadCourseDownloadFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
}).single('file');

// Settings video upload
const settingsVideoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: videoFileFilter,
  limits: { fileSize: 500 * 1024 * 1024 },
});
export const uploadSettingsVideo = settingsVideoUpload.single('video');

// Settings image upload (for site-wide image settings)
export const uploadSettingsImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
}).single('image');

// Product thumbnail upload
export const uploadProductThumbnail = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
}).single('thumbnail');

// Helper functions
export const getImageUrl = (filename: string, type: 'category' | 'course' | 'blog' = 'category'): string => {
  const config = type === 'category' ? uploadPaths.category : type === 'course' ? uploadPaths.course : uploadPaths.blog; 
  return `${config.publicPath}/${filename}`;
};

export const getVideoUrl = (filename: string): string => {
  return `${uploadPaths.productVideo.publicPath}/${filename}`;
};

export const getCourseTeaserVideoUrl = (filename: string): string => {
  return `${uploadPaths.courseTeaserVideo.publicPath}/${filename}`;
};

// export const deleteFile = (filePath: string): void => {
//   if (!filePath) return;
  
//   try {
//     const fullPath = path.join(process.cwd(), 'uploads', 
//       filePath.includes('videos/') ? 'videos' : 'images', 
//       path.basename(filePath));
    
//     if (fs.existsSync(fullPath)) {
//       fs.unlinkSync(fullPath);
//     }
//   } catch (error) {
//     console.error('Error deleting file:', error);
//   }
// };
