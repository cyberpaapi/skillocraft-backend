import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { z } from 'zod';

// Schema for validating revenue report query parameters
const revenueReportSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date must be in YYYY-MM-DD format'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'End date must be in YYYY-MM-DD format'),
});

// Get day-wise revenue report
export const getRevenueReport = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check if user is admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        status: 0,
        message: 'Access denied. Admin privileges required.',
      });
    }

    // Validate query parameters
    const validationResult = revenueReportSchema.safeParse(req.query);
    if (!validationResult.success) {
      return res.status(400).json({
        status: 0,
        message: 'Invalid query parameters',
        errors: validationResult.error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message
        }))
      });
    }

    const { startDate, endDate } = validationResult.data;

    // Convert string dates to Date objects
    const startDateTime = new Date(startDate);
    const endDateTime = new Date(endDate);
    
    // Set endDateTime to end of the day
    endDateTime.setHours(23, 59, 59, 999);

    // Validate date range
    if (startDateTime > endDateTime) {
      return res.status(400).json({
        status: 0,
        message: 'Start date must be before or equal to end date',
      });
    }

    // Get orders within the date range
    const orders = await prisma.orders.findMany({
      where: {
        status: 'ACTIVE',
        createdAt: {
          gte: startDateTime,
          lte: endDateTime,
        },
      },
      include: {
        course: {
          select: {
            id: true,
            price: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group orders by date and calculate statistics
    const dailyStats = new Map<string, {
      date: string;
      totalOrders: number;
      totalCourses: number;
      totalRevenue: number;
    }>();

    orders.forEach(order => {
      const orderDate = order.createdAt.toISOString().split('T')[0]; // Format: YYYY-MM-DD
      
      if (!dailyStats.has(orderDate)) {
        dailyStats.set(orderDate, {
          date: orderDate,
          totalOrders: 0,
          totalCourses: 0,
          totalRevenue: 0,
        });
      }

      const stats = dailyStats.get(orderDate)!;
      stats.totalOrders += 1;
      stats.totalCourses += order.course.length;
      
      // Sum up the revenue from all courses in this order
      const orderRevenue = order.course.reduce((sum, course) => {
        return sum + parseFloat(course.price || '0');
      }, 0);
      stats.totalRevenue += orderRevenue;
    });

    // Convert Map to array and sort by date
    const dailyStatsArray = Array.from(dailyStats.values()).sort((a, b) => 
      a.date.localeCompare(b.date)
    );

    // Calculate overall statistics
    const overallStats = {
      totalOrders: orders.length,
      totalCourses: orders.reduce((sum, order) => sum + order.course.length, 0),
      totalRevenue: orders.reduce((sum, order) => {
        return sum + order.course.reduce((orderSum, course) => 
          orderSum + parseFloat(course.price || '0'), 0
        );
      }, 0),
      averageOrderValue: orders.length > 0 
        ? orders.reduce((sum, order) => {
            return sum + order.course.reduce((orderSum, course) => 
              orderSum + parseFloat(course.price || '0'), 0
            );
          }, 0) / orders.length
        : 0,
    };

    res.status(200).json({
      status: 1,
      message: 'Revenue report retrieved successfully',
      data: {
        dateRange: {
          startDate,
          endDate,
        },
        overallStats,
        dailyStats: dailyStatsArray,
      },
    });
  } catch (error) {
    next(error);
  }
};