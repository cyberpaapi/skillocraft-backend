import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import { uploadPaths } from '../config/upload.config';

const bannerConfig = uploadPaths.banner;

// Use memory storage — file.buffer is available for Cloudinary / DO Spaces upload
const fileFilter: multer.Options['fileFilter'] = (
  req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
) => {
  if (bannerConfig.allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Only image files are allowed.`));
  }
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: bannerConfig.maxSize },
});

export const uploadBannerImage = upload.single('image');

// Generate public URL for the uploaded banner image
export const generateBannerUrl = (filename: string): string => {
  return `${bannerConfig.publicPath}/${filename}`;
};

// Delete banner image file
export const deleteBannerImage = (imageUrl: string): void => {
  if (!imageUrl) return;
  
  const filename = path.basename(imageUrl);
  const filePath = path.join(bannerConfig.dir, filename);
  
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
