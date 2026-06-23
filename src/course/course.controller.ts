import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { ActiveStatus, AuthRequest } from '../types';
import { getVideoDurationFromUrl, formatDuration } from '../utils/video-utils';
import { features } from 'process';

export const listCourses = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    const { page = 1, limit = 10, search, category, status } = req.query;

    const whereCondition: any = {
      status: 'ACTIVE' // Only show active courses by default
    };
    
    // Filter by category if provided
    if (category) {
      whereCondition.categoryId = category as string;
    }
    if (search) {
      whereCondition.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { shortDescription: { contains: search as string, mode: 'insensitive' } }
      ];
    }
    if (status) {
      whereCondition.status = status as ActiveStatus;
    }

    const courses = await prisma.course.findMany({
      where: whereCondition,
      skip: (Number(page) - 1) * Number(limit),
      take: Number(limit),
      include: {
        category: {
          select: {
            id: true,
            name: true
          }
        },
        creator:{
          select:{
            id: true,
            name: true,
            imageLink:true
          }
        },
        _count: {
          select: { product: true,orders:true }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    const total = await prisma.course.count({ where: whereCondition });

    res.status(200).json({
      status: 1,
      message: courses.length > 0 ? 'Courses retrieved successfully' : 'No courses found',
      courses: courses.map(course => ({
        id: course.id,
        name: course.name,
        imageLink: course.image,
        teaserVideo: course.teaserVideo,
        shortDescription: course.shortDescription,
        featured: course.featured,
        language: course.language, 
        pdfLink: course.pdfLink,
        whatsAppLink: course.whatsAppLink,
        category: (course as any).category || { id: course.categoryId },
        creator: (course as any).creator || { id: course.creatorId },
        productCount: course._count.product,
        orderCount: course._count.orders,
        status: course.status,
        price: course.price,
        discountedPrice: course.discountedPrice,
        createdBy: course.createdBy,
        createdAt: course.createdAt,
        updatedAt: course.updatedAt
      })),
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total
      }
    });
  } catch (error) {
    next(error);
  }
};

export const getCourseDetails = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params;

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        category: {
          select: {
            id: true,
            name: true
          }
        },
        creator:{
          select:{
            id: true,
            name: true,
            designation:true,
            description:true,
            imageLink:true
          }
        },
        product: {
          select: {
            id: true,
            name: true,
            discription: true,
            videoLink: true,
            videoStatus: true,
            lessonType: true,
            textContent: true,
            thumbnail: true,
            order: true,
            status: true,
            createdBy: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy: {
            order: 'asc'
          }
        },
        review: {
          select: {
            id: true,
            details: true,
            ratting: true,
            reviewerName: true,
            createdAt: true,
            updatedAt: true,
            customer: {
              select: {
                id: true,
                name: true,
                user: {
                  select: {
                    id: true,
                    avatarUrl: true
                  }
                }
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
      }
    });

    if (!course) {
      res.status(404).json({ 
        status: 0,
        message: 'Course not found',
        error: 'The requested course could not be found'
      });
      return;
    }

    // Extract all course fields and include related data
    const {
      id, name, image, teaserVideo, shortDescription, longDesription, price, status,
      createdBy, createdAt, updatedAt, product: products,
      category, categoryId, review: reviews,
      creator, creatorId, featured, language,
      pdfLink, whatsAppLink, discountedPrice, lectures, duration,
      recommended, certificate
    } = course;

    // Get similar courses (same category, exclude current course)
    const similarCourses = await prisma.course.findMany({
      where: {
        categoryId: categoryId,
        id: { not: id }, // Exclude current course
        status: 'ACTIVE' // Only show active courses
      },
      take: 5, // Limit to 5 similar courses
      select: {
        id: true,
        name: true,
        image: true,
        shortDescription: true,
        price: true,
        language: true,
        featured: true,
        review: {
          select: {
            ratting: true
          }
        },
        _count: {
          select: {
            product: true
          }
        }
      },
      orderBy: [
        { featured: 'desc' }, // Show featured courses first
        { createdAt: 'desc' } // Then sort by newest
      ]
    });

    // Get admin-selected recommended courses (exclude current course)
    const recommendedCoursesRaw = await prisma.course.findMany({
      where: {
        recommended: true,
        id: { not: id },
        status: 'ACTIVE'
      },
      take: 8,
      select: {
        id: true,
        name: true,
        image: true,
        shortDescription: true,
        price: true,
        discountedPrice: true,
        language: true,
        creator: { select: { name: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const recommendedCourses = recommendedCoursesRaw.map(c => ({
      id: c.id,
      name: c.name,
      image: c.image,
      shortDescription: c.shortDescription,
      price: c.price,
      discountedPrice: c.discountedPrice,
      language: c.language,
      creatorName: c.creator?.name || 'Skillocraft'
    }));

    // Calculate average rating for each similar course
    const similarCoursesWithRating = similarCourses.map(course => {
      const ratings = course.review.map(r => r.ratting);
      const avgRating = ratings.length > 0 
        ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
        : '0'; // Changed from 0 to '0' to ensure it's a string
      
      return {
        ...course,
        rating: parseFloat(avgRating),
        totalLessons: course._count.product,
        review: undefined, // Remove the reviews array from response
        _count: undefined // Remove the _count object from response
      };
    });

    // Get video durations for all products
    const productsWithDuration = await Promise.all(
      products.map(async (p) => {
        let duration = 0;
        let formattedDuration = '00:00:00';
        
        if (p.videoLink) {
          try {
            duration = await getVideoDurationFromUrl(p.videoLink);
            formattedDuration = formatDuration(duration);
          } catch (error) {
            console.error(`Error getting duration for product ${p.id}:`, error);
            duration = 0;
            formattedDuration = '00:00:00';
          }
        }
        
        return {
          ...p,
          duration,
          formattedDuration
        };
      })
    );

    res.status(200).json({
      status: 1,
      message: 'Course details retrieved successfully',
      data: {
        id,
        name,
        imageLink: image,
        teaserVideo,
        category: category || { id: categoryId },
        creator: creator || { id: creatorId },
        shortDescription,
        longDescription: longDesription,
        featured,
        language,
        price,
        discountedPrice,
        lectures,
        duration,
        recommended,
        certificate,
        status,
        pdfLink,
        whatsAppLink,
        createdBy,
        createdAt,
        updatedAt,
        products: productsWithDuration.map(p => ({
          id: p.id,
          name: p.name,
          description: p.discription,
          discription: p.discription,
          videoLink: p.videoLink,
          videoStatus: p.videoStatus,
          lessonType: p.lessonType,
          textContent: p.textContent,
          thumbnail: p.thumbnail,
          order: p.order,
          duration: p.duration,
          formattedDuration: p.formattedDuration,
          status: p.status,
          createdBy: p.createdBy,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        })),
        reviews: {
          count: reviews?.length || 0,
          data: reviews?.map(review => ({
            id: review.id,
            ratting: review.ratting,
            details: review.details,
            reviewerName: (review as any).reviewerName || null,
            customer: review.customer,
            createdAt: review.createdAt,
            updatedAt: review.updatedAt
          })) || []
        },
        similarCourses: similarCoursesWithRating,
        recommendedCourses
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get customers who purchased a specific course
export const getCourseCustomers = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params;

    if (!courseId) {
      res.status(400).json({
        status: 0,
        message: 'Course ID is required',
      });
      return;
    }

    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      res.status(404).json({
        status: 0,
        message: 'Course not found',
      });
      return;
    }

    // Get all customers who have purchased this course
    const orders = await prisma.orders.findMany({
      where: {
        course: {
          some: {
            id: courseId,
          },
        },
        status: 'ACTIVE',
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            createdAt: true,
            user: {
              select: {
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Extract unique customers (in case a customer ordered the same course multiple times)
    const uniqueCustomers = new Map();
    orders.forEach(order => {
      if (!uniqueCustomers.has(order.customer.id)) {
        uniqueCustomers.set(order.customer.id, {
          ...order.customer,
          orderDate: order.createdAt,
        });
      }
    });

    const customers = Array.from(uniqueCustomers.values());

    res.status(200).json({
      status: 1,
      message: 'Customers retrieved successfully',
      data: {
        courseId,
        courseName: course.name,
        totalCustomers: customers.length,
        customers,
      },
    });
  } catch (error) {
    next(error);
  }
};