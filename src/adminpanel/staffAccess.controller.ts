import { Request, Response, NextFunction } from 'express';
import { Prisma, ActiveStatus } from '@prisma/client';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

export const createStaffAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const accessData = req.body; // This should be an array

    // Validate that request body is an array
    if (!Array.isArray(accessData)) {
      res.status(400).json({
        status: 0,
        message: 'Request body must be an array of staff access objects'
      });
      return;
    }

    // Validate array is not empty
    if (accessData.length === 0) {
      res.status(400).json({
        status: 0,
        message: 'Array cannot be empty'
      });
      return;
    }

    // Validate each item in the array
    for (const item of accessData) {
      const { routeName, routeUrl } = item;

      if (!routeName) {
        res.status(400).json({
          status: 0,
          message: 'Route name is required for all items',
          error: 'Missing required field: routeName'
        });
        return;
      }

      if (!routeUrl) {
        res.status(400).json({
          status: 0,
          message: 'Route URL is required for all items',
          error: 'Missing required field: routeUrl'
        });
        return;
      }
    }

    // Check for existing routes (all routes from the array)
    const allRouteNames = accessData.map(item => item.routeName);
    const allRouteUrls = accessData.map(item => item.routeUrl);
    
    // const existingAccess = await prisma.staffAccess.findFirst({
    //   where: {
    //     OR: [
    //       { routeName: { in: allRouteNames, mode: 'insensitive' } },
    //       { routeUrl: { in: allRouteUrls } }
    //     ],
    //     status: 'ACTIVE'
    //   }
    // });

    const uniqueRouteNames = new Set(allRouteNames);
    if (uniqueRouteNames.size !== allRouteNames.length) {
      res.status(400).json({
        status: 0,
        message: 'Duplicate route names found in the request'
      });
      return;
    }
    // Check for existing routes in the database
    const existingAccess = await prisma.staffAccess.findFirst({
      where: {
        OR: [
          { 
            routeName: { 
              in: allRouteNames,
              mode: 'insensitive' 
            } 
          },
          { 
            routeUrl: { in: allRouteUrls } 
          }
        ],
        status: 'ACTIVE'
      }
    });

    if (existingAccess) {
      res.status(200).json({
        status: 0,
        message: 'A staff access with this route already exists',
        data: {
          conflictingRoute: existingAccess.routeName,
          conflictingUrl: existingAccess.routeUrl
        }
      });
      return;
    }

    // Create multiple staff access records
    const createdAccess = await prisma.staffAccess.createMany({
      data: accessData.map(item => ({
        routeName: item.routeName,
        routeUrl: item.routeUrl,
        status: 'ACTIVE'
      }))
    });

    // Fetch the created records to return them
    const fetchCreated = await prisma.staffAccess.findMany({
      where: {
        routeName: { in: allRouteNames }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(201).json({
      status: 1,
      message: 'Staff access created successfully',
      data: {
        created: fetchCreated,
        count: createdAccess.count
      }
    });
  } catch (error) {
    console.error('Error creating staff access:', error);
    
    // Handle unique constraint violation
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        res.status(400).json({
          status: 0,
          message: 'A staff access with this route and role already exists',
          error: 'Duplicate entry'
        });
        return;
      }
    }
    
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({
      status: 0,
      message: 'Failed to create staff access',
      error: errorMessage
    });
  }
};

export const updateStaffAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { routeName, roleId, status } = req.body;
    const userId = req.user?.email;

    if (!userId) {
      res.status(401).json({
        status: 0,
        message: 'Unauthorized: User not authenticated'
      });
      return;
    }

    // Check if staff access exists
    const existingAccess = await prisma.staffAccess.findUnique({
      where: { id }
    });

    if (!existingAccess) {
      res.status(404).json({
        status: 0,
        message: 'Staff access not found',
        error: 'Invalid ID'
      });
      return;
    }

    // Check if role exists if roleId is being updated
    if (roleId) {
      const roleExists = await prisma.staffRole.findUnique({
        where: { id: roleId, status: 'ACTIVE' }
      });

      if (!roleExists) {
        res.status(404).json({
          status: 0,
          message: 'Role not found or inactive',
          error: 'Invalid role ID'
        });
        return;
      }
    }

    // Update the staff access
    const updatedAccess = await prisma.staffAccess.update({
      where: { id },
      data: {
        ...(routeName && { routeName }),
        ...(roleId && { roleId }),
        ...(status && { status })
      },
      include: {
        StaffRole: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    res.status(200).json({
      status: 1,
      message: 'Staff access updated successfully',
      data: updatedAccess
    });
  } catch (error) {
    console.error('Error updating staff access:', error);
    
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        res.status(400).json({
          status: 0,
          message: 'A staff access with this route and role already exists',
          error: 'Duplicate entry'
        });
        return;
      }
    }
    
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({
      status: 0,
      message: 'Failed to update staff access',
      error: errorMessage
    });
  }
};

export const deleteStaffAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.email;

    if (!userId) {
      res.status(401).json({
        status: 0,
        message: 'Unauthorized: User not authenticated'
      });
      return;
    }

    // Check if staff access exists
    const existingAccess = await prisma.staffAccess.findUnique({
      where: { id }
    });

    if (!existingAccess) {
      res.status(404).json({
        status: 0,
        message: 'Staff access not found',
        error: 'Invalid ID'
      });
      return;
    }

    // Soft delete by updating status to INACTIVE
    await prisma.staffAccess.update({
      where: { id },
      data: { status: 'INACTIVE' }
    });

    res.status(200).json({
      status: 1,
      message: 'Staff access deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting staff access:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({
      status: 0,
      message: 'Failed to delete staff access',
      error: errorMessage
    });
  }
};

export const listStaffAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { roleId, status } = req.query;
    
    const where: any = {};
    
    // Filter by roleId if provided
    if (roleId) {
      where.roleId = roleId as string;
    }
    
    // Filter by status if provided, otherwise only active records
    where.status = status === 'ALL' ? undefined : 'ACTIVE';

    const staffAccessList = await prisma.staffAccess.findMany({
      where,
      include: {
        StaffRole: {
          select: {
            id: true,
            name: true,
            description: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.status(200).json({
      status: 1,
      message: 'Staff access list retrieved successfully',
      data: staffAccessList
    });
  } catch (error) {
    console.error('Error listing staff access:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve staff access list',
      error: errorMessage
    });
  }
};

export const getStaffAccessById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    
    const staffAccess = await prisma.staffAccess.findUnique({
      where: { id },
      include: {
        StaffRole: {
          select: {
            id: true,
            name: true,
            description: true
          }
        }
      }
    });

    if (!staffAccess) {
      res.status(404).json({
        status: 0,
        message: 'Staff access not found',
        error: 'Invalid ID'
      });
      return;
    }

    res.status(200).json({
      status: 1,
      message: 'Staff access retrieved successfully',
      data: staffAccess
    });
  } catch (error) {
    console.error('Error getting staff access:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({
      status: 0,
      message: 'Failed to retrieve staff access',
      error: errorMessage
    });
  }
};

export const deleteAllStaffAccess = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check if user is authorized (admin only)
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({
        status: 0,
        message: 'Unauthorized: Only admin users can perform this action'
      });
      return;
    }
    // Get count before deletion for the response
    const count = await prisma.staffAccess.count();
    // Delete all staff access records
    await prisma.staffAccess.deleteMany({});
    res.status(200).json({
      status: 1,
      message: `Successfully deleted all staff access records (${count} records)`,
      data: {
        deletedCount: count
      }
    });
  } catch (error) {
    console.error('Error deleting all staff access:', error);
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    res.status(500).json({
      status: 0,
      message: 'Failed to delete all staff access',
      error: errorMessage
    });
  }
};