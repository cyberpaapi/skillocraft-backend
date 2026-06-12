import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { z } from 'zod';
import { createOrderSchema } from '../schemas/order.schema';

// Match the Prisma schema's PaymentType enum
type PaymentMethod = 'CREDITCARD' | 'DEBITCARD' | 'NETBNKING' | 'UPI' | 'ONLINE';

// Create a new order
export const createOrder = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Validate request body
    const { cartIds, discountCode, totalAmount, payableAmount, transactionId, paymentType } = 
      createOrderSchema.parse(req.body);
    
    // Check if user email exists in the token
    if (!req.user?.email) {
      res.status(401).json({
        status: 0,
        message: 'Authentication required: No email found in token'
      });
      return;
    }

    // Get user from database using email to ensure we have the latest data
    const user = await prisma.user.findUnique({
      where: { email: req.user.email },
      include: {
        customer: true
      }
    });

    // Check if user exists and has customer role
    if (!user || user.role !== 'CUSTOMER' || !user.customer) {
      res.status(403).json({
        status: 0,
        message: 'Only customers can view their cart'
      });
      return;
    }

    // Start a transaction
    return await prisma.$transaction(async (prisma) => {
      // Get customer
      const customer = await prisma.customer.findFirst({
        where: { userId: user.id, status: 'ACTIVE' }
      });

      if (!customer) {
        throw new Error('Active customer profile not found');
      }

      // Get cart items
      const cartItems = await prisma.cart.findMany({
        where: {
          id: { in: cartIds },
          userId: user.id,
          status: 'ACTIVE'
        },
        include: {
          course: true
        }
      });

      if (cartItems.length === 0) {
        return res.status(400).json({
          status: 0,
          message: 'No valid cart items found',
        });
      }

      // Verify all requested cart items were found
      if (cartItems.length !== cartIds.length) {
        const foundIds = new Set(cartItems.map(item => item.id));
        const missingIds = cartIds.filter(id => !foundIds.has(id));
        
        return res.status(400).json({
          status: 0,
          message: 'Some cart items not found',
          missingCartIds: missingIds
        });
      }

      try {
        console.log('=== Order Creation Debug ===');
        console.log('Customer ID:', customer.id);
        console.log('Total Amount:', totalAmount);
        console.log('Payable Amount:', payableAmount);
        console.log('Transaction ID:', transactionId);
        console.log('Payment Type:', paymentType);
        console.log('Cart Items:', JSON.stringify(cartItems, null, 2));
        
        // Prepare order data
        const orderData: any = {
          customer: { connect: { id: customer.id } },
          totalAmount: parseFloat(totalAmount).toString(),
          paidAmount: parseFloat(payableAmount).toString(),
          transactionId,
          TransactionType: 'DEBIT',
          paymentType: paymentType as PaymentMethod,
          status: 'ACTIVE',
          description: `Payment for ${cartItems.length} course(s)`,
          // Connect order items
          course: {
            connect: cartItems.map(item => {
              console.log('Connecting course ID:', item.courseId);
              return { id: item.courseId };
            })
          }
        };
        
        console.log('Order Data to be created:', JSON.stringify(orderData, null, 2));

        // Only connect discount coupon if provided and not empty
        if (discountCode && discountCode.trim() !== '') {
          console.log('Applying discount code:', discountCode);
          orderData.discountCoupon = { connect: { id: discountCode } };
        } else {
          console.log('No discount code applied');
        }

        // Create order
        console.log('Attempting to create order with Prisma...');
        const order = await prisma.orders.create({
          data: orderData,
          include: {
            course: {
              select: {
                id: true,
                name: true,
                price: true
              }
            }
          }
        });

        console.log('Order created successfully:', JSON.stringify(order, null, 2));
        
        // Remove the cart items that were used in this order
        try {
          await prisma.cart.deleteMany({
            where: {
              id: { in: cartIds },
              userId: user.id,
              status: 'ACTIVE'
            }
          });
          console.log('Cart items deleted successfully for cart IDs:', cartIds);
        } catch (cartError) {
          console.error('Error deleting cart items:', cartError);
          // Note: We don't fail the order creation if cart deletion fails
          // The order is already created successfully, we just log the error
        }
        
        return res.status(200).json({
          status: 1,
          message: 'Order created successfully',
          data: order
        });
      } catch (err) {
        const error = err as Error;
        console.error('Error creating order:', error);
        console.error('Error details:', {
          name: error.name,
          message: error.message,
          stack: error.stack
        });
        return res.status(500).json({
          status: 0,
          message: 'Failed to create order',
          error: error.message
        });
      }

    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        status: 0,
        message: 'Validation error',
        errors: error.errors,
      });
    }
    next(error);
  }
};
// Get all orders for the logged-in user
export const getUserOrders = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Check if user email exists in the token
    if (!req.user?.email) {
      res.status(401).json({
        status: 0,
        message: 'Authentication required: No email found in token'
      });
      return;
    }
    // Get user from database using email to ensure we have the latest data
    const user = await prisma.user.findUnique({
      where: { email: req.user.email },
      include: {
        customer: true
      }
    });
    // Check if user exists and has customer role
    if (!user || user.role !== 'CUSTOMER' || !user.customer) {
      res.status(403).json({
        status: 0,
        message: 'Only customers can delete items from cart'
      });
      return;
    }

    // Find customer by user ID
    const customer = await prisma.customer.findFirst({
      where: {
        userId: user.id,
        status: 'ACTIVE'
      }
    });

    if (!customer) {
      return res.status(404).json({
        status: 0,
        message: 'Active customer profile not found',
      });
    }

    const orders = await prisma.orders.findMany({
      where: {
        customerId: customer.id,
        status: 'ACTIVE',
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
        discountCoupon: {
          select: {
            id: true,
            couponId: true, // Using couponId instead of code to match Prisma schema
            amount: true,
            amountType: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.status(200).json({
      status: 1,
      message: 'Orders retrieved successfully',
      data: orders,
    });
  } catch (error) {
    next(error);
  }
};

// Check if the authenticated user has already ordered a specific course
export const checkCourseOrdered = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Support tokens that provide either id or email
    let userId = req.user?.id;
    const userEmail = req.user?.email;
    if (!userId && !userEmail) {
      return res.status(401).json({
        status: 0,
        message: 'Authentication required',
      });
    }

    // If id is missing but email exists, look up the user to get id
    if (!userId && userEmail) {
      const user = await prisma.user.findUnique({ where: { email: userEmail } });
      userId = user?.id;
      if (!userId) {
        return res.status(401).json({
          status: 0,
          message: 'Authentication required',
        });
      }
    }

    const { courseId } = req.params as { courseId?: string };
    if (!courseId) {
      return res.status(400).json({
        status: 0,
        message: 'Course ID is required in URL parameters',
      });
    }

    const customer = await prisma.customer.findFirst({
      where: { userId, status: 'ACTIVE' },
      select: { id: true },
    });

    if (!customer) {
      return res.status(404).json({
        status: 0,
        message: 'Active customer profile not found',
      });
    }

    const existingOrder = await prisma.orders.findFirst({
      where: {
        customerId: customer.id,
        status: 'ACTIVE',
        course: { some: { id: courseId } },
      },
      select: { id: true },
    });

    return res.status(200).json({
      status: 1,
      ordered: Boolean(existingOrder),
    });
  } catch (error) {
    next(error);
  }
};

// Get order details by ID
export const getOrderDetails = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { orderId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        status: 0,
        message: 'Authentication required',
      });
    }

    const customer = await prisma.customer.findFirst({
      where: { 
        userId: userId,
        status: 'ACTIVE'
      }
    });

    if (!customer) {
      return res.status(404).json({
        status: 0,
        message: 'Customer profile not found',
      });
    }

    const order = await prisma.orders.findUnique({
      where: {
        id: orderId,
        customerId: customer.id,
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
        discountCoupon: {
          select: {
            couponId: true,
            amount: true,
            amountType: true,
            // Removed description as it's not in the schema
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        status: 0,
        message: 'Order not found',
      });
    }

    res.status(200).json({
      status: 1,
      message: 'Order details retrieved successfully',
      data: order,
    });
  } catch (error) {
    next(error);
  }
};

// Get all orders for admin with pagination
export const getAllOrdersForAdmin = async (
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

    // Get pagination parameters from query
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Get total count for pagination metadata
    const totalOrders = await prisma.orders.count({
      where: {
        status: 'ACTIVE',
      },
    });

    const totalPages = Math.ceil(totalOrders / limit);

    // Get orders with pagination
    const orders = await prisma.orders.findMany({
      where: {
        status: 'ACTIVE',
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            price: true,
            category: {
              select: { name: true },
            },
          },
        },
        discountCoupon: {
          select: {
            id: true,
            couponId: true,
            amount: true,
            amountType: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    });

    res.status(200).json({
      status: 1,
      message: 'Orders retrieved successfully',
      data: {
        orders,
        pagination: {
          currentPage: page,
          totalPages,
          totalOrders,
          limit,
          hasNext: page < totalPages,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};
