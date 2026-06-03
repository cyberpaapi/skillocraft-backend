import { Request, Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

// Helper function to get customer by user ID
async function getCustomerByUserId(userId: string) {
  const customer = await prisma.customer.findFirst({
    where: { 
      user: { id: userId }
    }
  });
  
  if (!customer) {
    return null;
  }
  
  return {
    ...customer,
    // Ensure we have the id property for TypeScript
    id: customer.id
  };
}

/**
 * @route   GET /api/wishlist
 * @desc    Get user's wishlist
 * @access  Private
 */
export const getWishlist = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get customer
    const customer = await getCustomerByUserId(userId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Get wishlist items with course details
    const wishlistItems = await prisma.wishlist.findMany({
      where: {
        customerId: customer.id,
        status: 'ACTIVE'
      },
      include: {
        course: {
          include: {
            category: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Format the response
    const formattedWishlist = wishlistItems.map(item => ({
      id: item.id,
      course: item.course,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      status: item.status
    }));

    res.status(200).json(formattedWishlist);
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/wishlist/:courseId
 * @desc    Add course to wishlist
 * @access  Private
 */
export const addToWishlist = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get customer by user ID
    const customer = await getCustomerByUserId(userId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return res.status(404).json({ error: 'Course not found' });
    }

    // Check if course is already in wishlist
    const existingWishlistItem = await prisma.wishlist.findFirst({
      where: {
        customerId: customer.id,
        courseId,
        status: 'ACTIVE',
      },
    });

    if (existingWishlistItem) {
      return res.status(400).json({ error: 'Course already in wishlist' });
    }

    // Add to wishlist
    const wishlistItem = await prisma.wishlist.create({
      data: {
        customerId: customer.id,
        courseId,
      },
      include: {
        course: {
          include: {
            category: true,
          },
        },
      },
    });

    res.status(201).json(wishlistItem);
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/wishlist/:courseId
 * @desc    Remove course from wishlist
 * @access  Private
 */
export const removeFromWishlist = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get customer by user ID
    const customer = await getCustomerByUserId(userId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Find and update wishlist item (soft delete)
    const wishlistItem = await prisma.wishlist.updateMany({
      where: {
        customerId: customer.id,
        courseId,
        status: 'ACTIVE'
      },
      data: {
        status: 'INACTIVE',
        updatedAt: new Date()
      }
    });

    if (wishlistItem.count === 0) {
      return res.status(404).json({ error: 'Wishlist item not found' });
    }

    res.status(200).json({ message: 'Course removed from wishlist' });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/wishlist/check/:courseId
 * @desc    Check if course is in wishlist
 * @access  Private
 */
export const checkInWishlist = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const { courseId } = req.params;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get customer by user ID
    const customer = await getCustomerByUserId(userId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    // Check if course is in wishlist
    const wishlistItem = await prisma.wishlist.findFirst({
      where: {
        customerId: customer.id,
        courseId,
        status: 'ACTIVE'
      },
      select: {
        id: true,
        createdAt: true
      }
    });

    res.status(200).json({
      inWishlist: !!wishlistItem,
      wishlistItem: wishlistItem || null
    });
  } catch (error) {
    next(error);
  }
};
