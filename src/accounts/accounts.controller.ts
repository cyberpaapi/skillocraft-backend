import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';
import { z } from 'zod';

// Validation schema for updating customer data
const updateCustomerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  contact: z.string().min(10, 'Contact must be at least 10 characters').optional(),
  avatarUrl: z.string().url('Invalid URL format').optional().or(z.literal(''))
});

export const getCustomerData = async (
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

    // Find the customer profile using the user ID
    const customer = await prisma.customer.findFirst({
      where: { 
        userId: user.id,
        status: 'ACTIVE' 
      },
      select: {
        id: true,
        name: true,
        status: true,
        user: {
          select: {
            id: true,
            email: true,
            contact:true,
            role: true,
            avatarUrl: true,
            status: true,
            createdAt: true,
            updatedAt: true
          }
        },
        address: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            address: true,
            city: true,
            state: true,
            pinCode: true,
            country: true
            // Removed isDefault as it's not in the schema
          }
        },
        orders: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            totalAmount: true,
            status: true,
            createdAt: true,
            course: {
              select: {
                id: true,
                name: true,
                image: true,
                price: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: 10 // Get only the 10 most recent orders
        }
      }
    });

    if (!customer) {
      res.status(404).json({
        status: 0,
        message: 'Customer profile not found'
      });
      return;
    }

    // Return the customer data
    res.status(200).json({
      status: 1,
      message: 'Profile retrieved successfully',
      data: customer
    });
  } catch (error) {
    console.error('Error getting customer profile:', error);
    next(error);
  }
};

export const updateCustomerData = async (
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

    // Validate request body
    const validation = updateCustomerSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        status: 0,
        message: 'Validation error',
        errors: validation.error.errors
      });
      return;
    }

    // Get user from database using email to ensure we have the latest data
    const user = await prisma.user.findUnique({
      where: { email: req.user.email },
      include: { 
        customer: {
          take: 1 // Only take the first customer if there are multiple
        } 
      }
    });

    // Check if user exists, has customer role, and has at least one customer profile
    if (!user || user.role !== 'CUSTOMER' || !user.customer || user.customer.length === 0) {
      res.status(403).json({
        status: 0,
        message: 'Only customers with a valid profile can update their information'
      });
      return;
    }
    
    // Get the first customer (should be the only one)
    const customer = user.customer[0];

    const { name, ...userData } = validation.data;
    
    // Start a transaction to update both user and customer records
    const [updatedUser, updatedCustomer] = await prisma.$transaction([
      // Update user data (contact, avatarUrl)
      prisma.user.update({
        where: { id: user.id },
        data: {
          ...(userData.contact && { contact: userData.contact }),
          ...(userData.avatarUrl !== undefined && { 
            avatarUrl: userData.avatarUrl || null 
          }),
          updatedAt: new Date()
        }
      }),
      
      // Update customer data (name)
      prisma.customer.update({
        where: { id: customer.id },
        data: {
          ...(name && { name }),
          updatedAt: new Date()
        }
      })
    ]);

    // Get the updated customer data with relations
    const customerWithDetails = await prisma.customer.findUnique({
      where: { id: customer.id },
      select: {
        id: true,
        name: true,
        status: true,
        user: {
          select: {
            id: true,
            email: true,
            contact: true,
            role: true,
            avatarUrl: true,
            status: true,
            createdAt: true,
            updatedAt: true
          }
        },
        address: {
          where: { status: 'ACTIVE' },
          select: {
            id: true,
            address: true,
            city: true,
            state: true,
            pinCode: true,
            country: true
          }
        },
        orders: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: {
            id: true,
            totalAmount: true,
            status: true,
            createdAt: true,
            course: {
              select: {
                id: true,
                name: true,
                image: true,
                price: true
              }
            }
          }
        }
      }
    });

    res.status(200).json({
      status: 1,
      message: 'Profile updated successfully',
      data: customerWithDetails
    });
  } catch (error) {
    console.error('Error updating customer profile:', error);
    next(error);
  }
};



export default {
  getCustomerData,
  updateCustomerData
};