import { v2 as cloudinary } from 'cloudinary';
import path from 'path';
import fs from 'fs-extra';

export const cloudinaryConfigured = !!(
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
);

if (cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME as string,
    api_key: process.env.CLOUDINARY_API_KEY as string,
    api_secret: process.env.CLOUDINARY_API_SECRET as string,
  });
}

export const uploadFile = async (
  file: Express.Multer.File,
  folder: string,
  localSubdir: string,
  resourceType: 'image' | 'video' | 'raw' = 'image'
): Promise<string> => {
  if (cloudinaryConfigured) {
    return new Promise((resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          { folder, resource_type: resourceType, use_filename: true, unique_filename: true },
          (error, result) => {
            if (error || !result) return reject(error || new Error('Cloudinary upload failed'));
            resolve(result.secure_url);
          }
        )
        .end(file.buffer);
    });
  }

  // Local disk fallback
  const dir = path.join(process.cwd(), 'uploads', localSubdir);
  await fs.ensureDir(dir);
  const filename = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  await fs.writeFile(path.join(dir, filename), file.buffer);
  return `/uploads/${localSubdir}/${filename}`;
};
