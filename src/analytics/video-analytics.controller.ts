import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import jwt from 'jsonwebtoken';
import { AuthRequest } from '../types';
import { getTotalVideoDuration, formatDuration, getVideoDurationFromUrl } from '../utils/video-utils';

// Get video analytics by course ID
export const getVideoAnalyticsByCourse = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { courseId } = req.params;
    
    if (!courseId) {
      res.status(400).json({
        status: 0,
        message: 'Course ID is required'
      });
      return;
    }

    // Get all analytics for the course
    const analytics = await prisma.videoAnalytics.findMany({
      where: {
        courseId: courseId
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            customer: {
              select: {
                name: true
              }
            }
          }
        },
        product: {
          select: {
            id: true,
            name: true
          }
        },
        course: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calculate summary statistics
    const totalViews = analytics.length;
    const totalWatchTime = analytics.reduce((sum, item) => sum + item.watchDuration, 0);
    const averageWatchTime = totalViews > 0 ? totalWatchTime / totalViews : 0;
    const averageCompletionRate = totalViews > 0 
      ? analytics.reduce((sum, item) => sum + item.completionRate, 0) / totalViews 
      : 0;

    // Device type distribution
    const deviceDistribution = analytics.reduce((acc, item) => {
      acc[item.deviceType] = (acc[item.deviceType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // OS distribution
    const osDistribution = analytics.reduce((acc, item) => {
      acc[item.operatingSystem] = (acc[item.operatingSystem] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Browser distribution
    const browserDistribution = analytics.reduce((acc, item) => {
      acc[item.browser] = (acc[item.browser] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.status(200).json({
      status: 1,
      message: 'Video analytics retrieved successfully',
      data: {
        analytics,
        summary: {
          totalViews,
          totalWatchTime,
          averageWatchTime: Math.round(averageWatchTime),
          averageCompletionRate: Math.round(averageCompletionRate * 100) / 100
        },
        deviceDistribution,
        osDistribution,
        browserDistribution
      }
    });

  } catch (error) {
    console.error('Error fetching video analytics by course:', error);
    res.status(500).json({
      status: 0,
      message: 'Error fetching video analytics'
    });
  }
};

// Get video analytics by user ID
export const getVideoAnalyticsByUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      res.status(400).json({
        status: 0,
        message: 'User ID is required'
      });
      return;
    }

    const analytics = await prisma.videoAnalytics.findMany({
      where: {
        userId: userId
      },
      include: {
        product: {
          select: {
            id: true,
            name: true
          }
        },
        course: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calculate user-specific statistics
    const totalVideosWatched = analytics.length;
    const totalWatchTime = analytics.reduce((sum, item) => sum + item.watchDuration, 0);
    const averageCompletionRate = totalVideosWatched > 0 
      ? analytics.reduce((sum, item) => sum + item.completionRate, 0) / totalVideosWatched 
      : 0;

    res.status(200).json({
      status: 1,
      message: 'User video analytics retrieved successfully',
      data: {
        analytics,
        summary: {
          totalVideosWatched,
          totalWatchTime,
          averageCompletionRate: Math.round(averageCompletionRate * 100) / 100
        }
      }
    });

  } catch (error) {
    console.error('Error fetching user video analytics:', error);
    res.status(500).json({
      status: 0,
      message: 'Error fetching user video analytics'
    });
  }
};

// Get overall video analytics summary (admin only)
export const getOverallVideoAnalytics = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({
        status: 0,
        message: 'Access denied. Admin privileges required.'
      });
      return;
    }

    const analytics = await prisma.videoAnalytics.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            customer: {
              select: {
                name: true
              }
            }
          }
        },
        product: {
          select: {
            id: true,
            name: true
          }
        },
        course: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calculate overall statistics
    const totalViews = analytics.length;
    const totalWatchTime = analytics.reduce((sum, item) => sum + item.watchDuration, 0);
    const averageWatchTime = totalViews > 0 ? totalWatchTime / totalViews : 0;
    const averageCompletionRate = totalViews > 0 
      ? analytics.reduce((sum, item) => sum + item.completionRate, 0) / totalViews 
      : 0;

    // Unique users and courses
    const uniqueUsers = new Set(analytics.map(item => item.userId)).size;
    const uniqueCourses = new Set(analytics.map(item => item.courseId)).size;

    // Device type distribution
    const deviceDistribution = analytics.reduce((acc, item) => {
      acc[item.deviceType] = (acc[item.deviceType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // OS distribution
    const osDistribution = analytics.reduce((acc, item) => {
      acc[item.operatingSystem] = (acc[item.operatingSystem] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Browser distribution
    const browserDistribution = analytics.reduce((acc, item) => {
      acc[item.browser] = (acc[item.browser] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Top courses by views
    const courseViews = analytics.reduce((acc, item) => {
      const courseName = item.course?.name || 'Unknown Course';
      acc[courseName] = (acc[courseName] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const topCourses = Object.entries(courseViews)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([courseName, views]) => ({ courseName, views }));

    res.status(200).json({
      status: 1,
      message: 'Overall video analytics retrieved successfully',
      data: {
        analytics,
        summary: {
          totalViews,
          totalWatchTime,
          averageWatchTime: Math.round(averageWatchTime),
          averageCompletionRate: Math.round(averageCompletionRate * 100) / 100,
          uniqueUsers,
          uniqueCourses
        },
        deviceDistribution,
        osDistribution,
        browserDistribution,
        topCourses
      }
    });

  } catch (error) {
    console.error('Error fetching overall video analytics:', error);
    res.status(500).json({
      status: 0,
      message: 'Error fetching overall video analytics'
    });
  }
};

// Get video analytics by product ID
export const getVideoAnalyticsByProduct = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { productId } = req.params;
    
    if (!productId) {
      res.status(400).json({
        status: 0,
        message: 'Product ID is required'
      });
      return;
    }

    const analytics = await prisma.videoAnalytics.findMany({
      where: {
        productId: productId
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            customer: {
              select: {
                name: true
              }
            }
          }
        },
        product: {
          select: {
            id: true,
            name: true
          }
        },
        course: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calculate product-specific statistics
    const totalViews = analytics.length;
    const totalWatchTime = analytics.reduce((sum, item) => sum + item.watchDuration, 0);
    const averageWatchTime = totalViews > 0 ? totalWatchTime / totalViews : 0;
    const averageCompletionRate = totalViews > 0 
      ? analytics.reduce((sum, item) => sum + item.completionRate, 0) / totalViews 
      : 0;

    res.status(200).json({
      status: 1,
      message: 'Product video analytics retrieved successfully',
      data: {
        analytics,
        summary: {
          totalViews,
          totalWatchTime,
          averageWatchTime: Math.round(averageWatchTime),
          averageCompletionRate: Math.round(averageCompletionRate * 100) / 100
        }
      }
    });

  } catch (error) {
    console.error('Error fetching product video analytics:', error);
    res.status(500).json({
      status: 0,
      message: 'Error fetching product video analytics'
    });
  }
};

// Get customer's watch history - products they've watched and how much
export const getCustomerWatchHistory = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      res.status(401).json({
        status: 0,
        message: 'User not authenticated'
      });
      return;
    }

    // Get all analytics for the user with product and course details
    const watchHistory = await prisma.videoAnalytics.findMany({
      where: {
        userId: userId
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            discription: true
          }
        },
        course: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Group by product and get the latest watch session
    const productHistory = watchHistory.reduce((acc, item) => {
      const existing = acc.get(item.productId);
      
      if (!existing || item.createdAt > existing.lastWatched) {
        acc.set(item.productId, {
          productId: item.productId,
          productName: item.product?.name || 'Unknown Product',
          productDescription: item.product?.discription || '',
          courseId: item.courseId,
          courseName: item.course?.name || 'Unknown Course',
          lastWatched: item.createdAt,
          watchDuration: item.watchDuration,
          totalTime: item.totalTime,
          completionRate: item.completionRate,
          deviceType: item.deviceType,
          watchSessions: watchHistory.filter(w => w.productId === item.productId).length
        });
      }
      
      return acc;
    }, new Map());

    // Convert map to array and calculate summary statistics
    const historyArray = Array.from(productHistory.values());
    const totalVideosWatched = historyArray.length;
    const totalWatchTime = historyArray.reduce((sum, item) => sum + item.watchDuration, 0);
    const averageCompletionRate = totalVideosWatched > 0 
      ? historyArray.reduce((sum, item) => sum + item.completionRate, 0) / totalVideosWatched 
      : 0;

    res.status(200).json({
      status: 1,
      message: 'Customer watch history retrieved successfully',
      data: {
        watchHistory: historyArray,
        summary: {
          totalVideosWatched,
          totalWatchTime,
          averageCompletionRate: Math.round(averageCompletionRate * 100) / 100
        }
      }
    });

  } catch (error) {
    console.error('Error fetching customer watch history:', error);
    res.status(500).json({
      status: 0,
      message: 'Error fetching customer watch history'
    });
  }
};

// Get total watch time for all products under a specific course for a customer
export const getCustomerCourseProgress = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;
    
    if (!userId) {
      res.status(401).json({
        status: 0,
        message: 'User not authenticated'
      });
      return;
    }

    if (!courseId) {
      res.status(400).json({
        status: 0,
        message: 'Course ID is required'
      });
      return;
    }

    // Get all analytics for the user in this specific course
    const courseAnalytics = await prisma.videoAnalytics.findMany({
      where: {
        userId: userId,
        courseId: courseId
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            discription: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Get total number of products in this course
    const totalProductsInCourse = await prisma.product.count({
      where: {
        courseId: courseId
      }
    });

    // Group by product to get unique products watched
    const watchedProducts = new Set(courseAnalytics.map(item => item.productId));
    const uniqueProductsWatched = watchedProducts.size;
    
    // Calculate total watch time and other metrics
    const totalWatchTime = courseAnalytics.reduce((sum, item) => sum + item.watchDuration, 0);
    const totalVideoTime = courseAnalytics.reduce((sum, item) => sum + item.totalTime, 0);
    const overallCompletionRate = totalVideoTime > 0 ? (totalWatchTime / totalVideoTime) * 100 : 0;
    
    // Group by product for detailed progress
    const productProgress = courseAnalytics.reduce((acc, item) => {
      const existing = acc.get(item.productId);
      
      if (!existing || item.watchDuration > existing.watchDuration) {
        acc.set(item.productId, {
          productId: item.productId,
          productName: item.product?.name || 'Unknown Product',
          productDescription: item.product?.discription || '',
          watchDuration: item.watchDuration,
          totalTime: item.totalTime,
          completionRate: item.completionRate,
          lastWatched: item.createdAt,
          isCompleted: item.completionRate >= 90 // Consider completed if 90% watched
        });
      }
      
      return acc;
    }, new Map());

    const progressArray = Array.from(productProgress.values());
    const completedProducts = progressArray.filter(p => p.isCompleted).length;
    
    res.status(200).json({
      status: 1,
      message: 'Customer course progress retrieved successfully',
      data: {
        courseId,
        courseProgress: {
          totalProductsInCourse,
          uniqueProductsWatched,
          completedProducts,
          completionPercentage: Math.round((uniqueProductsWatched / totalProductsInCourse) * 100),
          totalWatchTime,
          overallCompletionRate: Math.round(overallCompletionRate * 100) / 100
        },
        productProgress: progressArray
      }
    });

  } catch (error) {
    console.error('Error fetching customer course progress:', error);
    res.status(500).json({
      status: 0,
      message: 'Error fetching customer course progress'
    });
  }
};

// Get comprehensive course analytics with purchase verification
export const getCustomerCourseAnalytics = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(' ')[1];
    
    if (!token) {
      res.status(401).json({
        status: 0,
        message: 'Authentication token required'
      });
      return;
    }
    
    // Verify token and get user ID
    let userId: string;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key') as { userId: string };
      userId = decoded.userId;
    } catch (error) {
      res.status(401).json({
        status: 0,
        message: 'Invalid or expired token'
      });
      return;
    }
    const { courseId } = req.params;

    if (!courseId) {
      res.status(400).json({
        status: 0,
        message: 'Course ID is required'
      });
      return;
    }

    // First, check if the customer has purchased the course
    // Get customer ID from user
    const customer = await prisma.customer.findFirst({
      where: {
        userId: userId,
        status: 'ACTIVE'
      }
    });

    if (!customer) {
      res.status(404).json({
        status: 0,
        message: 'Customer profile not found'
      });
      return;
    }

    // Check if customer has an order that includes this course
    const hasPurchased = await prisma.orders.findFirst({
      where: {
        customerId: customer.id,
        course: {
          some: {
            id: courseId
          }
        },
        status: 'ACTIVE' // ACTIVE status means successful purchase
      }
    });

    if (!hasPurchased) {
      res.status(403).json({
        status: 0,
        message: 'You have not purchased this course'
      });
      return;
    }

    // Get all products in the course
    const courseProducts = await prisma.product.findMany({
      where: {
        courseId: courseId
      },
      select: {
        id: true,
        name: true,
        discription: true,
        videoLink: true
      }
    });

    // Get all analytics for the user in this specific course
    const courseAnalytics = await prisma.videoAnalytics.findMany({
      where: {
        userId: userId,
        courseId: courseId
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            discription: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Calculate total video time of all products in the course using actual video durations
    const videoUrls = courseProducts.map(product => product.videoLink).filter((v): v is string => !!v);
    const totalVideoTimeInSeconds = await getTotalVideoDuration(videoUrls);
    const totalVideoTime = totalVideoTimeInSeconds;

    const totalProductsAvailable = courseProducts.length;
    
    // Group by product to get unique products watched and their watch times
    const productWatchData = new Map();
    
    courseAnalytics.forEach(item => {
      const existing = productWatchData.get(item.productId);
      
      if (!existing || item.watchDuration > existing.watchDuration) {
        productWatchData.set(item.productId, {
          productId: item.productId,
          productName: item.product?.name || 'Unknown Product',
          productDescription: item.product?.discription || '',
          watchDuration: item.watchDuration,
          totalTime: item.totalTime,
          completionRate: item.completionRate,
          lastWatched: item.createdAt,
          isCompleted: item.completionRate >= 90 // Consider completed if 90% watched
        });
      }
    });

    const productWatchArray = Array.from(productWatchData.values());
    const completedProducts = productWatchArray.filter(p => p.isCompleted).length;
    
    // Get actual video durations for each product
    const productDurations = await Promise.all(
      courseProducts.map(async (product) => {
        if (product.videoLink) {
          try {
            const duration = await getVideoDurationFromUrl(product.videoLink);
            return { productId: product.id, duration };
          } catch (error) {
            console.error(`Error getting duration for product ${product.id}:`, error);
            return { productId: product.id, duration: 0 };
          }
        }
        return { productId: product.id, duration: 0 };
      })
    );

    // Create a duration map for easy lookup
    const durationMap = new Map(productDurations.map(item => [item.productId, item.duration]));

    // Create a complete list of all products with their watch status
    const allProductsWithProgress = courseProducts.map(product => {
      const watchData = productWatchData.get(product.id);
      const actualVideoDuration = durationMap.get(product.id) || 0;
      
      return {
        productId: product.id,
        productName: product.name,
        productDescription: product.discription,
        videoLink: product.videoLink,
        watchDuration: watchData?.watchDuration || 0,
        watchDurationFormatted: formatDuration(watchData?.watchDuration || 0),
        totalTime: actualVideoDuration, // Use actual video duration
        totalTimeFormatted: formatDuration(actualVideoDuration),
        completionRate: watchData?.completionRate || 0,
        lastWatched: watchData?.lastWatched || null,
        isCompleted: watchData?.isCompleted || false,
        isWatched: !!watchData
      };
    });

    res.status(200).json({
      status: 1,
      message: 'Course analytics retrieved successfully',
      data: {
        courseId,
        purchaseInfo: {
          hasPurchased: true,
          purchaseDate: hasPurchased.createdAt
        },
        courseSummary: {
          totalVideoTime,
          totalVideoTimeFormatted: formatDuration(totalVideoTime),
          totalProductsAvailable,
          completedProducts,
          totalWatchTime: productWatchArray.reduce((sum, item) => sum + item.watchDuration, 0),
          totalWatchTimeFormatted: formatDuration(productWatchArray.reduce((sum, item) => sum + item.watchDuration, 0))
        },
        productProgress: allProductsWithProgress
      }
    });

  } catch (error) {
    console.error('Error fetching customer course analytics:', error);
    res.status(500).json({
      status: 0,
      message: 'Error fetching customer course analytics'
    });
  }
};
