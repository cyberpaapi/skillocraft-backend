import { Response, NextFunction } from "express";
import { AuthRequest } from '../types';
import prisma from "../db/db.config";

export const addToCart = async(
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
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
                message: 'Only customers can add items to cart'
            });
            return;
        }

        const { courseId } = req.body;
        
        // Validate courseId
        if (!courseId) {
            res.status(400).json({
                status: 0,
                message: 'Course ID is required'
            });
            return;
        }

        // Check if course exists
        const course = await prisma.course.findUnique({
            where: { id: courseId }
        });

        if (!course) {
            res.status(404).json({
                status: 0,
                message: 'Course not found'
            });
            return;
        }

        // Check if this course is already in the user's cart
        const existing = await prisma.cart.findFirst({
            where: {
                userId: user.id,
                courseId: courseId,
            }
        });

        if (existing) {
            res.status(409).json({
                status: 0,
                message: 'Course is already in your cart',
                cartId: existing.id
            });
            return;
        }

        // Add to cart
        const cartItem = await prisma.cart.create({
            data: {
                userId: user.id,
                courseId: courseId,
            }
        });
        
        res.status(200).json({
            status: 1,
            message: 'Course added to cart successfully',
            cartId: cartItem.id
        });
    } catch (error) {
        console.error('Error in addToCart:', error);
        next(error);
    }
}

export const listCart = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
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
        message: 'Only customers can view their cart'
      });
      return;
    }

    const cart = await prisma.cart.findMany({
      where: {
        userId: user.id
      },
      include: {
        course: {
          include: {
            category: {
              select: {
                id: true,
                name: true
              }
            },
            creator: {
              select: {
                id: true,
                name: true,
                imageLink: true,
                description: true,
              }
            },
            _count: {
              select: { 
                product: true,
                orders: true 
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(200).json({
      status: 1,
      message: cart.length > 0 ? 'Cart retrieved successfully' : 'No items found',
      courses: cart.map(item => ({
        id: item.id,
        courseId: item.courseId,
        name: item.course.name,
        imageLink: item.course.image,
        shortDescription: item.course.shortDescription,
        longDescription: item.course.longDesription,
        category: item.course.category,
        creator: item.course.creator, 
        productCount: item.course._count?.product || 0,
        orderCount: item.course._count?.orders || 0,
        status: item.course.status,
        price: item.course.price,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }))
    });
  } catch (error) {
    console.error('Error in listCart:', error);
    next(error);
  }
};

// Check if a course is already in the authenticated user's cart
export const checkInCart = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Ensure authenticated user
    if (!req.user?.email) {
      res.status(401).json({
        status: 0,
        message: 'Authentication required: No email found in token'
      });
      return;
    }

    // Load user and ensure they are a CUSTOMER with active profile
    const user = await prisma.user.findUnique({
      where: { email: req.user.email },
      include: { customer: true }
    });

    if (!user || user.role !== 'CUSTOMER' || !user.customer) {
      res.status(403).json({
        status: 0,
        message: 'Only customers can check cart items'
      });
      return;
    }

    // Read courseId from URL params for consistency with other check APIs
    const { courseId } = req.params as { courseId?: string };
    if (!courseId) {
      res.status(400).json({
        status: 0,
        message: 'Course ID is required in URL parameters'
      });
      return;
    }

    // Check existence in cart
    const existing = await prisma.cart.findFirst({
      where: { userId: user.id, courseId }
    });

    res.status(200).json({
      status: 1,
      inCart: Boolean(existing)
    });
  } catch (error) {
    console.error('Error in checkInCart:', error);
    next(error);
  }
};

export const deleteCart = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
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

    // Get cartId from URL parameters
    const { cartId } = req.params;
    
    // Validate cartId
    if (!cartId) {
      res.status(400).json({
        status: 0,
        message: 'Cart ID is required in URL parameters'
      });
      return;
    }

    // Check if cart item exists and belongs to the user
    const cartItem = await prisma.cart.findFirst({
      where: {
        id: cartId,
        userId: user.id
      }
    });

    if (!cartItem) {
      res.status(404).json({
        status: 0,
        message: 'Cart item not found or you do not have permission to delete it'
      });
      return;
    }

    // Delete the cart item
    await prisma.cart.delete({
      where: {
        id: cartId
      }
    });
    
    res.status(200).json({
      status: 1,
      message: 'Course deleted from cart successfully'
    });
  } catch (error) {
    console.error('Error in deleteCart:', error);
    next(error);
  }
};