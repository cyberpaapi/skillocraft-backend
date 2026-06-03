// src/adminpanel/dashboard.controller.ts
import { Request, Response } from 'express';
import prisma from '../db/db.config';


export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    // 1. Get total customers
    const totalCustomers = await prisma.customer.count();
    
    // 2. Get total courses
    const totalCourses = await prisma.course.count();
    
    // 3. Get all orders with necessary data
    const orders = await prisma.orders.findMany({
      where: { status: 'ACTIVE' },
      select: {
        paidAmount: true,
        createdAt: true,
        customerId: true
      }
    });

    // 4. Calculate total earnings
    const totalEarnings = orders.reduce((sum, order) => {
      return sum + parseFloat(order.paidAmount || '0');
    }, 0);

    // 5. Calculate today's earnings
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Start of today
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1); // Start of tomorrow
    
    const todaysEarnings = orders
      .filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= today && orderDate < tomorrow;
      })
      .reduce((sum, order) => sum + parseFloat(order.paidAmount || '0'), 0);

    // 6. Calculate customer distribution
    const customersWithOrders = new Set(orders.map(order => order.customerId));
    const customerDistribution = {
      customer_purchased: customersWithOrders.size,
      customer_not_purchased: totalCustomers - customersWithOrders.size
    };

    // 7. Calculate monthly revenue for current year
    const currentYear = new Date().getFullYear();
    const monthlyRevenue: Record<string, number> = {};
    
    // Initialize all months to 0
    const months = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ];
    
    months.forEach(month => {
      monthlyRevenue[month] = 0;
    });

    // Calculate revenue for each month
    for (let i = 0; i < 12; i++) {
      const monthStart = new Date(currentYear, i, 1);
      const monthEnd = new Date(currentYear, i + 1, 0, 23, 59, 59);
      
      const monthlyOrders = orders.filter(order => {
        const orderDate = new Date(order.createdAt);
        return orderDate >= monthStart && orderDate <= monthEnd;
      });
      
      const monthRevenue = monthlyOrders.reduce(
        (sum, order) => sum + parseFloat(order.paidAmount || '0'), 
        0
      );
      
      monthlyRevenue[months[i]] = monthRevenue;
    }

    // 8. Prepare and send response
    const response = {
      status: 1,
      message: 'Fetched successfully',
      Data: {
        total_customer: totalCustomers,
        total_courses: totalCourses,
        total_orders: orders.length,
        total_earnings: totalEarnings,
        todays_earnings: todaysEarnings,
        customer_distribution: customerDistribution,
        revenue: monthlyRevenue
      }
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      status: 0,
      message: 'Error fetching dashboard statistics',
      error: (error as Error).message
    });
  }
};