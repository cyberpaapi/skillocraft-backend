import { Response, NextFunction } from 'express';
//import fs from 'fs';
//import path from 'path';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { updateProductSchema } from '../schemas/course.schema';
// import { uploadVideo } from '../middleware/upload.middleware';
// import { uploadPaths } from '../config/upload.config';
import { deleteFromSpaces } from '../utils/deleteFromSpaces';
import { uploadToSpaces } from '../utils/uploadToSpaces';

import path from "path";
import fs from "fs-extra";
import { convertToHLS } from "../services/hlsConverter";
import { uploadFolderToSpaces } from "../services/spacesUploader";
import { logMemoryUsage, checkMemoryLimit, forceGarbageCollection } from "../utils/memory";
import { deleteFolderFromSpaces } from '../utils/deleteFolderFromSpaces';
import { uploadFile, cloudinaryConfigured } from '../utils/uploadFile';
import { uploadVideoToVdoCipher, deleteVideoFromVdoCipher } from '../services/vdoCipher';

const VDOCIPHER_ID_REGEX = /^[0-9a-f]{32}$/i;
const vdoCipherEnabled   = !!process.env.VDOCIPHER_API_SECRET;
// export const createProduct = async (
//   req: AuthRequest & { file?: Express.Multer.File },
//   res: Response,
//   next: NextFunction
// ) => {
//   console.log('=== Starting product creation ===');
//   console.log('Request file:', req.file);
//   console.log('Request body:', req.body);
  
//   // Get the uploaded file
//   const file = req.file;
  
//   if (!file) {
//     return res.status(400).json({
//       status: 0,
//       message: 'No file uploaded',
//       details: 'Please upload a video file'
//     });
//   }
  
//   // Log file details
//   console.log('Uploaded file details:', {
//     originalname: file.originalname,
//     mimetype: file.mimetype,
//     size: file.size,
//     path: file.path
//   });
  
//   // Extract other form fields from the request body
//   const { name, description, courseId, status, order } = req.body;
  
//   // Validate required fields
//   if (!name || !courseId) {
//     // Clean up the uploaded file if validation fails
//     // if (file.path && fs.existsSync(file.path)) {
//     //   fs.unlinkSync(file.path);
//     // }
//     return res.status(400).json({
//       status: 0,
//       message: 'Validation failed',
//       details: 'Name and courseId are required fields'
//     });
//   }
  
//   try {
//     // Check if course exists
//     const course = await prisma.course.findUnique({
//       where: { id: courseId },
//     });

//     if (!course) {
//       // Clean up the uploaded file if course doesn't exist
//       // if (file.path && fs.existsSync(file.path)) {
//       //   fs.unlinkSync(file.path);
//       // }
//       return res.status(404).json({
//         status: 0,
//         message: 'Course not found',
//         details: `Course with ID ${courseId} does not exist`
//       });
//     }

//     // Create the product in the database
//     // Generate the public URL for the uploaded video
//     //const videoUrl = `${process.env.API_BASE_URL || 'http://localhost:4000'}/uploads/videos/products/${path.basename(file.path)}`;
//     const videoUrl = await uploadToSpaces(
//       file,
//       'videos/products'
//     );
//     // Create the product in the database with the video URL
//     const product = await prisma.product.create({
//       data: {
//         name,
//         discription: description,
//         videoLink: videoUrl, // Store the full public URL
//         status: status || 'ACTIVE',
//         course: {
//           connect: { id: courseId }
//         },
//         createdBy: req.user?.email || ''
//       },
//       include: {
//         course: {
//           select: {
//             id: true,
//             name: true
//           }
//         }
//       }
//     });

//     // Return success response
//     return res.status(201).json({
//       status: 1,
//       message: 'Product created successfully',
//       data: {
//         ...product,
//         videoUrl
//       }
//     });
//   } catch (error: unknown) {
//     console.error('Error creating product:', error);
    
//     // Clean up the uploaded file if there was an error
//     // if (file?.path && fs.existsSync(file.path)) {
//     //   fs.unlinkSync(file.path);
//     // }

//     const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    
//     return res.status(500).json({
//       status: 0,
//       message: 'Failed to create product',
//       error: errorMessage,
//       details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
//     });
//   }
// }

const r2Enabled      = !!(process.env.CF_R2_ACCESS_KEY && process.env.CF_R2_SECRET_KEY);
const useLocalStorage = !r2Enabled;

export const createProduct = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const { name, description, courseId, status, lessonType = 'VIDEO', textContent } = req.body;

  if (!name || !courseId) {
    return res.status(400).json({ status: 0, message: 'Name and courseId required' });
  }

  const needsText = lessonType === 'TEXT' || lessonType === 'BOTH';
  if (needsText && !textContent) {
    return res.status(400).json({ status: 0, message: 'Text content required for this lesson type' });
  }

  try {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ status: 0, message: 'Course not found' });

    const existingCount = await prisma.product.count({ where: { courseId } });

    const product = await prisma.product.create({
      data: {
        name,
        discription: description || '',
        lessonType: lessonType as any,
        videoLink: null,
        videoStatus: 'idle',
        textContent: textContent || null,
        status: status || 'ACTIVE',
        order: existingCount,
        course: { connect: { id: courseId } },
        createdBy: req.user?.email || '',
      },
      include: { course: { select: { id: true, name: true } } },
    });

    return res.status(201).json({ status: 1, message: 'Product created successfully', data: product });
  } catch (error) {
    console.error('Product creation error:', error);
    return res.status(500).json({ status: 0, message: 'Failed to create lesson' });
  }
};

export const reorderProducts = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (req.user?.role !== 'ADMIN') {
    return res.status(403).json({ status: 0, message: 'Unauthorized' });
  }
  const { items } = req.body as { items: { id: string; order: number }[] };
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ status: 0, message: 'items array required' });
  }
  try {
    await prisma.$transaction(
      items.map(({ id, order }) =>
        prisma.product.update({ where: { id }, data: { order } })
      )
    );
    return res.json({ status: 1, message: 'Order saved' });
  } catch (error) {
    console.error('Reorder error:', error);
    return res.status(500).json({ status: 0, message: 'Failed to reorder lessons' });
  }
};

export const updateProduct = async (
  req: AuthRequest & { file?: Express.Multer.File }, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  const { productId } = req.params;
  try {
  // Use the uploadVideo middleware with .single() for single file upload
    // Check if product exists
    const existingProduct = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!existingProduct) {
      res.status(404).json({ 
        status: 0,
        message: 'Product not found' 
      });
      return Promise.resolve();
    }

  // Parse and validate request body
  const body = req.body;
  const { error, data } = updateProductSchema.safeParse({
    ...body,
    // Convert string 'undefined' to actual undefined
    videoLink: body.videoLink === 'undefined' ? undefined : body.videoLink,
    order: body.order ? Number(body.order) : undefined
  });

  if (error) {
    // Clean up uploaded file if validation fails
    // if (req.file) {
    //   fs.unlinkSync(req.file.path);
    // }
    res.status(400).json({
      status: 0,
      message: 'Validation error',
      errors: error.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message
      }))
    });
    return Promise.resolve();
  }

  // Prepare update data
  const updateData: any = {
    ...data,
    updatedAt: new Date()
  };

  // If a new video file was uploaded, update the video URL
  // if (req.file) {
  //   //const uploadDir = path.join(process.cwd(), 'uploads', 'videos');
  //   //updateData.videoLink = `${process.env.API_BASE_URL || 'http://localhost:8000'}/uploads/videos/${path.basename(req.file.path)}`;
    
  //   // Delete the old video file if it exists
  //   if (existingProduct.videoLink && existingProduct.videoLink.startsWith('http')) {
  //     try {
  //       //const oldFilename = path.basename(existingProduct.videoLink);
  //       //const oldPath = path.join(uploadDir, oldFilename);
  //       // if (fs.existsSync(oldPath)) {
  //       //   fs.unlinkSync(oldPath);
  //       // }
  //       await deleteFromSpaces(existingProduct.videoLink);
  //       updateData.videoLink = await uploadToSpaces(
  //         req.file,
  //         'videos/products'
  //       );
  //     } catch (err: unknown) {
  //       const error = err as Error;
  //       console.error('Error deleting old video file:', error.message);
  //       // Continue with the update even if deleting the old file fails
  //     }
  //   }
  // }

  const sanitizedName = existingProduct.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const videoId = `${sanitizedName}-${Date.now()}`;
  const tempRoot = path.join(process.cwd(), "temp");
  const rawVideoPath = path.join(tempRoot, `${videoId}.mp4`);
  const hlsOutputFolder = path.join(tempRoot, videoId);

  if (req.file) {
    try {
      const getBuffer = async () => req.file!.buffer ?? await fs.readFile(req.file!.path);

      if (vdoCipherEnabled) {
        // ─── VdoCipher ────────────────────────────────────────────────────
        if (existingProduct.videoLink && VDOCIPHER_ID_REGEX.test(existingProduct.videoLink)) {
          deleteVideoFromVdoCipher(existingProduct.videoLink).catch(console.error);
        }
        updateData.videoLink = await uploadVideoToVdoCipher(await getBuffer(), existingProduct.name);
        if (req.file.path) await fs.remove(req.file.path);

      } else if (useLocalStorage) {
        // ─── Local disk (dev only) ────────────────────────────────────────
        const uploadsDir = path.join(process.cwd(), 'uploads', 'videos');
        await fs.ensureDir(uploadsDir);
        const filename = `${videoId}.mp4`;
        if (req.file.path) {
          await fs.move(req.file.path, path.join(uploadsDir, filename));
        } else {
          await fs.writeFile(path.join(uploadsDir, filename), req.file.buffer);
        }
        updateData.videoLink = `/uploads/videos/${filename}`;

      } else if (cloudinaryConfigured) {
        // ─── Cloudinary ───────────────────────────────────────────────────
        updateData.videoLink = await uploadFile(req.file, 'skillocraft/videos', 'videos', 'video');
        if (req.file.path) await fs.remove(req.file.path);

      } else {
        // ─── R2: file already on disk ─────────────────────────────────────
        if (existingProduct.videoLink) {
          const oldFolder = existingProduct.videoLink.replace('/index.m3u8', '');
          await deleteFolderFromSpaces(oldFolder);
        }
        const rawVideoPath    = req.file.path ?? path.join(tempRoot, `${videoId}.mp4`);
        const hlsOutputFolder = path.join(tempRoot, videoId);
        if (!req.file.path) await fs.writeFile(rawVideoPath, req.file.buffer);
        await convertToHLS(rawVideoPath, hlsOutputFolder);
        const remoteFolder = `videos/products/${videoId}`;
        await uploadFolderToSpaces(hlsOutputFolder, remoteFolder);
        await fs.remove(rawVideoPath);
        await fs.remove(hlsOutputFolder);
        updateData.videoLink = `${remoteFolder}/index.m3u8`;
      }

    } catch (err) {
      console.error("Video update error:", err);
      res.status(500).json({ status: 0, message: 'Failed to process video update' });
      return;
    }
  }


  // Update product
  const updatedProduct = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(updateData.name && { name: updateData.name }),
      ...(updateData.courseId && { courseId: updateData.courseId }),
      ...(updateData.videoLink && { videoLink: updateData.videoLink }),
      ...(updateData.description && { description: updateData.description }),
      ...(updateData.status && { status: updateData.status })
    }
  });

    // ---------------------------------------
    // 6️⃣ Cleanup temp files
    // ---------------------------------------
    await fs.remove(rawVideoPath);
    await fs.remove(hlsOutputFolder);

  res.status(200).json({ 
    message: 'Product updated successfully',
    product: {
      id: updatedProduct.id,
      name: updatedProduct.name,
      courseId: updatedProduct.courseId
    }
  });
  } catch (error) {
    // Clean up uploaded file in case of error
    // if (req.file && fs.existsSync(req.file.path)) {
    //   fs.unlinkSync(req.file.path);
    // }

    // Handle validation or other errors
    if (error instanceof Error) {
      res.status(400).json({ errors: error.message });
    } else {
      next(error);
    }
  };
}

export const deleteProduct = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Ensure only admin can delete products
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Unauthorized to delete product' });
      return;
    }

    const { productId } = req.params;

    // Check if product exists
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      res.status(404).json({ error: 'Product not found' });
      return;
    }

    if (product.videoLink) {
      try {
        if (VDOCIPHER_ID_REGEX.test(product.videoLink)) {
          await deleteVideoFromVdoCipher(product.videoLink);
        } else if (r2Enabled) {
          const oldFolder = product.videoLink.replace('/index.m3u8', '');
          await deleteFolderFromSpaces(oldFolder);
        }
      } catch (err) {
        console.warn('Could not delete video:', err);
      }
    }

    // Delete product
    await prisma.product.delete({
      where: { id: productId }
    });

    res.status(200).json({ 
      message: 'Product deleted successfully' 
    });
  } catch (error) {
    next(error);
  }
};