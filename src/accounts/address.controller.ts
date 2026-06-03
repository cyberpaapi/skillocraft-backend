import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import prisma from '../db/db.config';
import { addressSchema, updateAddressSchema } from '../schemas/address.schema';
import { AuthRequest } from '../types';

export const createAddress = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Validate input
    const validatedData = addressSchema.parse(req.body);

    // Determine user type and ID
    let userId: string | undefined;
    let userType: 'customerId' | 'staffId' | 'adminId' | undefined;

    switch (req.user.role) {
      case 'CUSTOMER':
        const customer = await prisma.customer.findFirst({
          where: { userId: req.user.id },
          select: { id: true }
        });
        userId = customer?.id;
        userType = 'customerId';
        break;
      case 'STAFF':
        const staff = await prisma.staff.findFirst({
          where: { userId: req.user.id },
          select: { id: true }
        });
        userId = staff?.id;
        userType = 'staffId';
        break;
      case 'ADMIN':
        const admin = await prisma.admin.findFirst({
          where: { userId: req.user.id },
          select: { id: true }
        });
        userId = admin?.id;
        userType = 'adminId';
        break;
    }

    // If no user found, return unauthorized
    if (!userId || !userType) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Create address
    const address = await prisma.address.create({
      data: {
        ...validatedData,
        [userType]: userId
      }
    });

    res.status(201).json(address);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      });
      return;
    }
    next(error);
  }
};

export const listAddresses = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Determine user type and ID
    let userId: string | undefined;
    let userType: 'customerId' | 'staffId' | 'adminId' | undefined;

    switch (req.user.role) {
      case 'CUSTOMER':
        const customer = await prisma.customer.findFirst({
          where: { userId: req.user.id },
          select: { id: true }
        });
        userId = customer?.id;
        userType = 'customerId';
        break;
      case 'STAFF':
        const staff = await prisma.staff.findFirst({
          where: { userId: req.user.id },
          select: { id: true }
        });
        userId = staff?.id;
        userType = 'staffId';
        break;
      case 'ADMIN':
        const admin = await prisma.admin.findFirst({
          where: { userId: req.user.id },
          select: { id: true }
        });
        userId = admin?.id;
        userType = 'adminId';
        break;
    }

    // If no user found, return unauthorized
    if (!userId || !userType) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Fetch addresses
    const addresses = await prisma.address.findMany({
      where: {
        [userType]: userId
      }
    });

    res.json(addresses);
  } catch (error) {
    next(error);
  }
};

export const updateAddress = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Validate input
    const validatedData = updateAddressSchema.parse(req.body);

    // Determine user type and ID
    let userId: string | undefined;
    let userType: 'customerId' | 'staffId' | 'adminId' | undefined;

    switch (req.user.role) {
      case 'CUSTOMER':
        const customer = await prisma.customer.findFirst({
          where: { userId: req.user.id },
          select: { id: true }
        });
        userId = customer?.id;
        userType = 'customerId';
        break;
      case 'STAFF':
        const staff = await prisma.staff.findFirst({
          where: { userId: req.user.id },
          select: { id: true }
        });
        userId = staff?.id;
        userType = 'staffId';
        break;
      case 'ADMIN':
        const admin = await prisma.admin.findFirst({
          where: { userId: req.user.id },
          select: { id: true }
        });
        userId = admin?.id;
        userType = 'adminId';
        break;
    }

    // If no user found, return unauthorized
    if (!userId || !userType) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Check if address belongs to the user
    const existingAddress = await prisma.address.findFirst({
      where: {
        id: validatedData.id,
        [userType]: userId
      }
    });

    if (!existingAddress) {
      res.status(403).json({ error: 'Address not found or unauthorized' });
      return;
    }

    // Update address
    const updatedAddress = await prisma.address.update({
      where: { id: validatedData.id },
      data: {
        ...validatedData,
        [userType]: userId
      }
    });

    res.json(updatedAddress);
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        error: 'Validation failed',
        details: error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message
        }))
      });
      return;
    }
    next(error);
  }
};

export const deleteAddress = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Ensure user is authenticated
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { id } = req.params;

    // Determine user type and ID
    let userId: string | undefined;
    let userType: 'customerId' | 'staffId' | 'adminId' | undefined;

    switch (req.user.role) {
      case 'CUSTOMER':
        const customer = await prisma.customer.findFirst({
          where: { userId: req.user.id },
          select: { id: true }
        });
        userId = customer?.id;
        userType = 'customerId';
        break;
      case 'STAFF':
        const staff = await prisma.staff.findFirst({
          where: { userId: req.user.id },
          select: { id: true }
        });
        userId = staff?.id;
        userType = 'staffId';
        break;
      case 'ADMIN':
        const admin = await prisma.admin.findFirst({
          where: { userId: req.user.id },
          select: { id: true }
        });
        userId = admin?.id;
        userType = 'adminId';
        break;
    }

    // If no user found, return unauthorized
    if (!userId || !userType) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Check if address belongs to the user
    const existingAddress = await prisma.address.findFirst({
      where: {
        id,
        [userType]: userId
      }
    });

    if (!existingAddress) {
      res.status(403).json({ error: 'Address not found or unauthorized' });
      return;
    }

    // Delete address
    await prisma.address.delete({
      where: { id }
    });

    res.json({ message: 'Address deleted successfully' });
  } catch (error) {
    next(error);
  }
};