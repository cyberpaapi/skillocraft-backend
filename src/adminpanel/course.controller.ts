import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
//import fs from 'fs';
//import path from 'path';
import { ActiveStatus, Prisma } from '@prisma/client';
import prisma from '../db/db.config';
import { createCourseRequestSchema } from '../schemas/course.schema';
import { AuthRequest } from '../types';
import { uploadFile } from '../utils/uploadFile';
import { deleteFromSpaces } from '../utils/deleteFromSpaces';
// import { getImageUrl } from '../middleware/upload.middleware';

// Extend Express Request type to include file
declare global {
  namespace Express {
    interface Request {
      file?: Express.Multer.File;
    }
  }
}

// Helper function to handle file cleanup
// const cleanupUploadedFile = (filePath: string | undefined): void => {
//   if (filePath && fs.existsSync(filePath)) {
//     try {
//       fs.unlinkSync(filePath);
//     } catch (error) {
//       console.error('Error cleaning up file:', error);
//     }
//   }
// };

export const createCourse = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  // Check if files exist
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  
  const imageFile = files?.image?.[0] ?? null;
  const teaserVideoFile = files.teaserVideo ? files.teaserVideo[0] : null;
  const pdfFile = files.pdfFile ? files.pdfFile[0] : null;

  try {
    // Validate required fields
    const requiredFields = ['name', 'shortDescription', 'price', 'categoryId'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      // cleanupUploadedFile(imageFile.path);
      // if (teaserVideoFile) {
      //   cleanupUploadedFile(teaserVideoFile.path);
      // }
      res.status(400).json({
        status: 0,
        message: 'Missing required fields',
        error: `The following fields are required: ${missingFields.join(', ')}`,
        fields: missingFields
      });
      return;
    }

    // Ensure user is admin
    if (req.user?.role !== 'ADMIN') {
      // cleanupUploadedFile(imageFile.path);
      // if (teaserVideoFile) {
      //   cleanupUploadedFile(teaserVideoFile.path);
      // }
      res.status(403).json({ 
        status: 0,
        message: 'Unauthorized to create course' 
      });
      return;
    }

    // Parse and validate the request body
    const { error: validationError, data: validatedData } = createCourseRequestSchema.safeParse({
      ...req.body,
      price: req.body.price ? String(req.body.price) : undefined,
      longDesription: req.body.longDescription || '' // Map longDescription to longDesription
    });

    if (validationError) {
      // cleanupUploadedFile(imageFile.path);
      // if (teaserVideoFile) {
      //   cleanupUploadedFile(teaserVideoFile.path);
      // }
      res.status(400).json({
        status: 0,
        message: 'Validation error',
        errors: validationError.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      });
      return;
    }

    // Parse price and ensure it's a positive number
    const price = parseFloat(validatedData.price);
    if (isNaN(price) || price < 0) {
      // cleanupUploadedFile(imageFile.path);
      // if (teaserVideoFile) {
      //   cleanupUploadedFile(teaserVideoFile.path);
      // }
      res.status(400).json({
        status: 0,
        message: 'Invalid price',
        error: 'Price must be a positive number'
      });
      return;
    }
    
    const priceAsString = price.toString();

    // Verify category exists
    const category = await prisma.category.findUnique({
      where: { id: validatedData.categoryId }
    });

    if (!category) {
      // cleanupUploadedFile(imageFile.path);
      // if (teaserVideoFile) {
      //   cleanupUploadedFile(teaserVideoFile.path);
      // }
      const response = res.status(400).json({
        status: 0,
        message: 'Invalid category ID',
        error: 'The specified category does not exist'
      });
      return Promise.resolve();
    }

    // First, upload the image and get the image URL
    //const imageUrl = `/uploads/images/courses/${imageFile.filename}`;
    
    // Handle teaser video if uploaded
    let teaserVideoUrl = '';
    // if (teaserVideoFile) {
    //   teaserVideoUrl = `/uploads/videos/courses/${teaserVideoFile.filename}`;

    // }
    
    // Handle PDF file if uploaded
    let pdfLink = '';
    // if (pdfFile) {
    //   pdfLink = `/uploads/pdfs/courses/${pdfFile.filename}`;
    // }
    
    try {
      // Ensure we have a valid user
      if (!req.user?.email) {
        throw new Error('User email not found in token');
      }
      
      console.log('Creating course with user email:', req.user.email);
      console.log('Request body:', JSON.stringify(validatedData, null, 2));

      const featured = typeof validatedData.featured === 'string' 
  ? validatedData.featured === 'true' || validatedData.featured === '1'
  : Boolean(validatedData.featured);

      const imageUrl = imageFile ? await uploadFile(imageFile, 'images/courses', 'images/courses', 'image') : '';

      if (teaserVideoFile) {
        teaserVideoUrl = await uploadFile(teaserVideoFile, 'videos/courses', 'videos/courses', 'video');
      }

      if (pdfFile) {
        pdfLink = await uploadFile(pdfFile, 'pdfs/courses', 'pdfs/courses', 'raw');
      }

      // Create the course with the correct field names from Prisma schema
      const course = await prisma.course.create({
        data: {
          name: validatedData.name,
          shortDescription: validatedData.shortDescription,
          longDesription: validatedData.longDescription || '',
          price: priceAsString,
          image: imageUrl,
          teaserVideo: teaserVideoUrl,
          language: validatedData.language,
          whatsAppLink: validatedData.whatsAppLink,
          pdfLink: pdfLink,
          discountedPrice: validatedData.discountedPrice ? parseFloat(validatedData.discountedPrice).toString() : null,
          lectures: validatedData.lectures || null,
          duration: validatedData.duration || null,
          recommended: Boolean(validatedData.recommended),
          certificate: req.body.certificate ? String(req.body.certificate) : null,
          status: ActiveStatus.ACTIVE,
          featured: featured,
          createdBy: req.user.email, // Using email for consistency with category creation
          category: {
            connect: { id: validatedData.categoryId }
          },
          creator: {
            connect: { id: validatedData.creatorId }
          }
        },
        include: {
          category: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      // Define the response data type with proper typing
      type ResponseCourse = typeof course & {
        category: { id: string; name: string };
      };

      // Create the response data with proper typing
      const responseData: ResponseCourse = {
        ...course,
        category: {
          id: validatedData.categoryId,
          name: ''
        }
      };

      // If we have the category and subcategory from the include, use those
      const courseWithRelations = course as any;
      
      if (courseWithRelations.category) {
        responseData.category = {
          id: courseWithRelations.category.id || validatedData.categoryId,
          name: courseWithRelations.category.name || ''
        };
      }

      res.status(201).json({
        status: 1,
        message: 'Course created successfully',
        data: responseData
      });
    } catch (error) {
      console.error('Error creating course:', error);
      
      // Clean up the uploaded files if there was an error
      // if (imageFile?.path) {
      //   cleanupUploadedFile(imageFile.path);
      // }
      // if (teaserVideoFile?.path) {
      //   cleanupUploadedFile(teaserVideoFile.path);
      // }
      // if (pdfFile?.path) {
      //   cleanupUploadedFile(pdfFile.path);
      // }
      
      if (error instanceof ZodError) {
        res.status(400).json({ 
          status: 0,
          message: 'Validation error',
          errors: error.errors 
        });
      } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
        res.status(400).json({
          status: 0,
          message: 'Database error',
          error: error.message
        });
      } else {
        res.status(500).json({
          status: 0,
          message: 'Internal server error',
          error: error instanceof Error ? error.message : 'An unexpected error occurred'
        });
      }
    }
  } catch (error) {
    console.error('Unexpected error in createCourse:', error);
    res.status(500).json({
      status: 0,
      message: 'Internal server error',
      error: 'An unexpected error occurred while processing your request'
    });
  }
};

export const updateCourse = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { courseId } = req.params;

  try {
    // Check if course exists with proper typing
    const existingCourse = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        category: { select: { id: true, name: true } }
      }
    });

    if (!existingCourse) {
      res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
      return Promise.resolve();
    }

    // Type assertion for the existing course with all fields
    const courseData = existingCourse as Prisma.CourseGetPayload<{
      include: {
        category: { select: { id: true, name: true } };
        subCategory: { select: { id: true, name: true } };
      };
    }> & { image?: string; longDesription?: string };



    // Check if user is admin
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({
        status: 0,
        message: 'Unauthorized to update course'
      });
      return;
    }

    // Handle file uploads (image and/or teaserVideo)
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const imageFile = files?.image?.[0] ?? (req.file ?? null);
    const teaserVideoFile = files?.teaserVideo?.[0] ?? null;

    let imageUrl = courseData.image || '';
    if (imageFile) {
      if (courseData.image) await deleteFromSpaces(courseData.image);
      imageUrl = await uploadFile(imageFile, 'images/courses', 'images', 'image');
    }

    const existingTeaser = (existingCourse as any).teaserVideo || '';
    let teaserVideoUrl = existingTeaser;
    if (teaserVideoFile) {
      if (existingTeaser) await deleteFromSpaces(existingTeaser);
      teaserVideoUrl = await uploadFile(teaserVideoFile, 'videos/courses', 'videos', 'video');
    }

    // Prepare update data
    const updateData: Prisma.CourseUpdateInput = {
      name: req.body.name || courseData.name,
      shortDescription: req.body.shortDescription || courseData.shortDescription,
      longDesription: req.body.longDescription || courseData.longDesription || undefined,
      image: imageUrl,
      teaserVideo: teaserVideoUrl,
      language: req.body.language || courseData.language,
      status: (req.body.status as ActiveStatus) || courseData.status,
      featured: req.body.featured !== undefined ? req.body.featured === 'true' : undefined,
      category: req.body.categoryId ? { connect: { id: req.body.categoryId } } : undefined,
    };

    // Only update price if provided
    if (req.body.price) {
      updateData.price = parseFloat(req.body.price).toString();
    }
    if (req.body.discountedPrice !== undefined) {
      updateData.discountedPrice = req.body.discountedPrice ? parseFloat(req.body.discountedPrice).toString() : null;
    }
    if (req.body.lectures !== undefined) {
      updateData.lectures = req.body.lectures ? String(req.body.lectures) : null;
    }
    if (req.body.duration !== undefined) {
      updateData.duration = req.body.duration ? String(req.body.duration) : null;
    }
    if (req.body.recommended !== undefined) {
      updateData.recommended = req.body.recommended === 'true' || req.body.recommended === true;
    }
    if (req.body.certificate !== undefined) {
      updateData.certificate = req.body.certificate ? String(req.body.certificate) : null;
    }

    // Update course data
    const updatedCourse = await prisma.course.update({
      where: { id: courseId },
      data: updateData,
      include: {
        category: { select: { id: true, name: true } }
      }
    });

    res.json({
      status: 1,
      message: 'Course updated successfully',
      data: updatedCourse
    });
    return;

  } catch (error) {
    console.error('Error updating course:', error);
    
    // Clean up the uploaded file if there was an error
    // if (req.file?.path) {
    //   cleanupUploadedFile(req.file.path);
    // }
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      res.status(400).json({
        status: 0,
        message: 'Database error',
        error: error.message
      });
      return;
    } else {
      res.status(500).json({
        status: 0,
        message: 'Internal server error',
        error: 'An unexpected error occurred'
      });
      return;
    }
  }
};

export const deleteCourse = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const { courseId } = req.params;

  try {
    // Check if the course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: { product: true }
    });

    if (!course) {
      res.status(404).json({
        status: 0,
        message: 'Course not found'
      });
      return;
    }

    // Check if user is admin
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({
        status: 0,
        message: 'Unauthorized to delete course'
      });
      return;
    }

    // Delete associated products first (if any)
    if (course.product.length > 0) {
      // Delete associated product images
      for (const product of course.product) {
        if (product.videoLink) {
          await deleteFromSpaces(product.videoLink);
        }
      }
      await prisma.product.deleteMany({
        where: { courseId: course.id }
      });
    }

    // Delete the course

    // Clean up the course image if it exists
    if (course.image) {
      // const imagePath = path.join(process.cwd(), 'public', course.image);
      // cleanupUploadedFile(imagePath);
      await deleteFromSpaces(course.image);
      await deleteFromSpaces(course.teaserVideo || '');
      await deleteFromSpaces(course.pdfLink || '');
    }

    await prisma.course.delete({
      where: { id: courseId }
    });

    res.json({
      status: 1,
      message: 'Course deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting course:', error);
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      res.status(400).json({
        status: 0,
        message: 'Database error',
        error: error.message
      });
    } else {
      res.status(500).json({
        status: 0,
        message: 'Internal server error',
        error: 'An unexpected error occurred'
      });
    }
  }
};

// Export other controller functions
export * from './course.controller';
