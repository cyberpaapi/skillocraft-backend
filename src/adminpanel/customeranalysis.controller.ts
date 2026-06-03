import { Request, Response, NextFunction } from 'express';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Define interfaces based on Prisma types
type OrderWithCourse = Prisma.OrdersGetPayload<{
  include: {
    course: true;
  };
}>;

type CartWithCourse = Prisma.CartGetPayload<{
  include: {
    course: true;
  };
}>;

interface CustomerData {
  id: string;
  name: string;
  email?: string;
  contact?: string;
  joinedDate?: Date;
  cartItemCount: number;
  lastPurchaseDate: Date | null;
  purchaseCount: number;
  totalSpent: number;
  cartItems: Array<{
    id: string;
    course: {
      id: string;
      name: string;
      price: string | number;
      category: string;
    };
    status: string;
    createdAt: Date;
  }>;
  purchaseHistory: Array<{
    id: string;
    status: string;
    course: {
      id: string;
      name: string;
      price: string | number;
      category: string;
    } | null;
    totalAmount: string;
    paidAmount: string;
    paymentType: string;
    createdAt: Date;
  }>;
  purchasedCategories: string[];
}

export const getCustomerAnalysis = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const allCustomers = await prisma.customer.findMany({
      include: {
        user: {
          select: {
            email: true,
            contact: true,
            createdAt: true,
            cart: {
              where: { status: 'ACTIVE' },
              include: {
                course: {
                  select: {
                    id: true,
                    name: true,
                    price: true,
                    category: true
                  }
                }
              }
            }
          }
        },
        orders: {
          where: { status: 'ACTIVE' },
          include: {
            course: {
              select: {
                id: true,
                name: true,
                price: true,
                category: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    const customersWithCartOnly: CustomerData[] = [];
    const customersWithPurchases: CustomerData[] = [];
    const inactiveCustomers: CustomerData[] = [];

    for (const customer of allCustomers) {
      const user = customer.user;
      const cartItems = user?.cart || [];
      const orders = customer.orders || [];
      
      const hasItemsInCart = cartItems.length > 0;
      const hasPurchases = orders.length > 0;

      // Calculate last purchase date from orders
      const lastPurchaseDate = orders[0]?.createdAt || null;

      // Get unique categories from orders
      const purchasedCategories = new Set<string>();
      orders.forEach(order => {
        const category = order.course?.[0]?.category?.name;
        if (category) {
          purchasedCategories.add(category);
        }
      });

      // Calculate total spent
      const totalSpent = orders.reduce((sum, order) => {
        return sum + parseFloat(order.paidAmount || '0');
      }, 0);

      const customerData: CustomerData = {
        id: customer.id,
        name: customer.name,
        email: user?.email,
        contact: user?.contact,
        joinedDate: user?.createdAt,
        cartItemCount: cartItems.length,
        lastPurchaseDate,
        purchaseCount: orders.length,
        totalSpent,
        cartItems: cartItems.map(item => ({
          id: item.id,
          course: {
            id: item.course.id,
            name: item.course.name,
            price: item.course.price,
            category: item.course.category?.name || 'Uncategorized'
          },
          status: item.status,
          createdAt: item.createdAt
        })),
        purchaseHistory: orders.map(order => ({
          id: order.id,
          status: order.status,
          course: order.course?.[0] ? {
            id: order.course[0].id,
            name: order.course[0].name,
            price: order.course[0].price,
            category: order.course[0].category?.name || 'Uncategorized'
          } : null,
          totalAmount: order.totalAmount,
          paidAmount: order.paidAmount,
          paymentType: order.paymentType,
          createdAt: order.createdAt
        })),
        purchasedCategories: Array.from(purchasedCategories)
      };

      if (hasItemsInCart && !hasPurchases) {
        customersWithCartOnly.push(customerData);
      } else if (hasPurchases) {
        customersWithPurchases.push(customerData);
      } else {
        inactiveCustomers.push(customerData);
      }
    }

    res.status(200).json({
      success: true,
      data: {
        customersWithCartOnly,
        customersWithPurchases,
        inactiveCustomers,
        stats: {
          totalCustomers: allCustomers.length,
          customersWithCartOnly: customersWithCartOnly.length,
          customersWithPurchases: customersWithPurchases.length,
          inactiveCustomers: inactiveCustomers.length,
        }
      }
    });
  } catch (error) {
    next(error);
  } finally {
    await prisma.$disconnect();
  }
};

export const getCustomerDetails = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { customerId } = req.params;

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        user: {
          select: {
            email: true,
            contact: true,
            createdAt: true,
            cart: {
              where: { status: 'ACTIVE' },
              include: {
                course: {
                  select: {
                    id: true,
                    name: true,
                    price: true,
                    category: true
                  }
                }
              }
            }
          }
        },
        orders: {
          where: { status: 'ACTIVE' },
          include: {
            course: {
              select: {
                id: true,
                name: true,
                price: true,
                category: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        }
      }
    });

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Calculate total spent from orders
    const totalSpent = customer.orders.reduce((sum, order) => {
      return sum + parseFloat(order.paidAmount || '0');
    }, 0);

    // Get unique categories from orders
    const purchasedCategories = new Set<string>();
    customer.orders.forEach(order => {
      const category = order.course?.[0]?.category?.name;
      if (category) {
        purchasedCategories.add(category);
      }
    });

    // Transform cart items to match expected format
    const cartItems = customer.user?.cart?.map(item => ({
      id: item.id,
      product: {
        id: item.course.id,
        name: item.course.name,
        price: item.course.price,
        category: item.course.category?.name || 'Uncategorized'
      },
      quantity: 1,
      status: item.status,
      createdAt: item.createdAt
    })) || [];

    // Transform orders to match expected format
    const purchaseHistory = customer.orders.map(order => ({
      id: order.id,
      status: order.status,
      course: order.course?.[0] ? {
        id: order.course[0].id,
        name: order.course[0].name,
        price: order.course[0].price,
        category: order.course[0].category?.name || 'Uncategorized'
      } : null,
      totalAmount: order.totalAmount,
      paidAmount: order.paidAmount,
      paymentType: order.paymentType,
      createdAt: order.createdAt
    }));

    res.status(200).json({
      success: true,
      data: {
        id: customer.id,
        name: customer.name,
        email: customer.user?.email,
        contact: customer.user?.contact,
        joinedDate: customer.user?.createdAt,
        totalSpent,
        totalOrders: customer.orders.length,
        cartItems,
        purchaseHistory,
        purchasedCategories: Array.from(purchasedCategories),
        lastPurchaseDate: customer.orders[0]?.createdAt || null
      }
    });
  } catch (error) {
    console.error('Error getting customer details:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while fetching customer details'
    });
  } finally {
    await prisma.$disconnect();
  }
};