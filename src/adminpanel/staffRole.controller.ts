import { Request, Response, NextFunction } from 'express';
import { Prisma, ActiveStatus } from '@prisma/client';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

/**
 * Create a new staff role
 * @route POST /adminpanel/staff-roles
 * @access Private/Admin
 */
export const createStaffRole = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { name, description, staffAccessIds } = req.body;
    const userMail = req.user?.email;

    if (!userMail) {
      res.status(401).json({
        status: 0,
        message: 'Unauthorized: User not authenticated'
      });
      return;
    }

    // Validate required fields
    if (!name) {
      res.status(400).json({
        status: 0,
        message: 'Name is required',
        error: 'Missing required field: name'
      });
      return;
    }

    // Check if role with same name already exists
    const existingRole = await prisma.staffRole.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } }
    });

    if (existingRole) {
      res.status(409).json({
        status: 0,
        message: 'A role with this name already exists'
      });
      return;
    }

    // Create new role with optional staff access associations
    const role = await prisma.staffRole.create({
      data: {
        name,
        description: description || '',
        StaffAccess: staffAccessIds?.length ? {
          connect: staffAccessIds.map((id: string) => ({ id }))
        } : undefined
      },
      include: {
        StaffAccess: true
      }
    });

    res.status(201).json({
      status: 1,
      message: 'Staff role created successfully',
      data: role
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update an existing staff role
 * @route PUT /adminpanel/staff-roles/:id
 * @access Private/Admin
 */
export const updateStaffRole = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        status: 0,
        message: 'Unauthorized: User not authenticated'
      });
      return;
    }

    // Check if role exists
    const existingRole = await prisma.staffRole.findUnique({
      where: { id }
    });

    if (!existingRole) {
      res.status(404).json({
        status: 0,
        message: 'Staff role not found'
      });
      return;
    }

    // Check if another role with the same name already exists
    if (name && name !== existingRole.name) {
      const duplicateRole = await prisma.staffRole.findFirst({
        where: {
          name: { equals: name, mode: 'insensitive' },
          id: { not: id }
        }
      });

      if (duplicateRole) {
        res.status(409).json({
          status: 0,
          message: 'Another role with this name already exists'
        });
        return;
      }
    }

    // Update role
    const updatedRole = await prisma.staffRole.update({
      where: { id },
      data: {
        name: name || existingRole.name,
        description: description !== undefined ? description : existingRole.description,
        status: status || existingRole.status,
        updatedAt: new Date()
      }
    });

    res.status(200).json({
      status: 1,
      message: 'Staff role updated successfully',
      data: updatedRole
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a staff role
 * @route DELETE /adminpanel/staff-roles/:id
 * @access Private/Admin
 */
export const deleteStaffRole = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        status: 0,
        message: 'Unauthorized: User not authenticated'
      });
      return;
    }

    // Check if role exists
    const role = await prisma.staffRole.findUnique({
      where: { id },
      include: { StaffAccess: true }
    });

    if (!role) {
      res.status(404).json({
        status: 0,
        message: 'Staff role not found'
      });
      return;
    }

    // Check if role has associated staff accesses
    if (role.StaffAccess && role.StaffAccess.length > 0) {
      res.status(400).json({
        status: 0,
        message: 'Cannot delete role with associated staff accesses. Please remove the accesses first.'
      });
      return;
    }

    // Delete role
    await prisma.staffRole.delete({
      where: { id }
    });

    res.status(200).json({
      status: 1,
      message: 'Staff role deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all staff roles
 * @route GET /adminpanel/staff-roles
 * @access Private/Admin
 */
export const listStaffRoles = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { status } = req.query;
    
    const where: any = {};
    
    // Filter by status if provided
    if (status === 'ACTIVE' || status === 'INACTIVE') {
      where.status = status;
    }

    const roles = await prisma.staffRole.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        StaffAccess: {
          select: {
            id: true,
            routeName: true,
            status: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy: { routeName: 'asc' }
        },
        _count: {
          select: { StaffAccess: true }
        }
      }
    });

    res.status(200).json({
      status: 1,
      data: roles.map(role => ({
        ...role,
        accessCount: role._count.StaffAccess,
        // Remove the _count field from the response
        _count: undefined
      }))
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a single staff role by ID
 * @route GET /adminpanel/staff-roles/:id
 * @access Private/Admin
 */
export const getStaffRoleById = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const role = await prisma.staffRole.findUnique({
      where: { id },
      include: {
        StaffAccess: {
          select: {
            id: true,
            routeName: true,
            status: true,
            createdAt: true
          }
        }
      }
    });

    if (!role) {
      res.status(404).json({
        status: 0,
        message: 'Staff role not found'
      });
      return;
    }

    res.status(200).json({
      status: 1,
      data: role
    });
  } catch (error) {
    next(error);
  }
};