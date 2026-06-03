import { Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

// List all customers (admin/staff usage recommended)
// Supports optional filtering and pagination via query params:
// - status: 'ACTIVE' | 'INACTIVE'
// - search: matches customer.name, user.email, or user.contact (case-insensitive)
// - page: number (default 1)
// - limit: number (default 20)
export const listCustomers = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Enforce admin-only access
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({
        status: 0,
        message: 'Forbidden: Admin access required'
      });
      return;
    }
    const { status, search } = req.query as {
      status?: 'ACTIVE' | 'INACTIVE';
      search?: string;
    };
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);

    const where: any = {};
    if (status === 'ACTIVE' || status === 'INACTIVE') {
      where.status = status;
    }
    if (search && search.trim().length > 0) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { contact: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [customers, total] = await Promise.all([
      prisma.customer.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              contact: true,
              role: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            }
          },
          address: true,
          _count: {
            select: { orders: true, wishlist: true, review: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.customer.count({ where })
    ]);

    res.status(200).json({
      status: 1,
      message: customers.length > 0 ? 'Customers retrieved successfully' : 'No customers found',
      data: customers.map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        referalCode:c.referalCode,
        user: c.user,
        address: c.address,
        counts: {
          orders: c._count.orders,
          wishlist: c._count.wishlist,
          reviews: c._count.review,
        }
      })),
      pagination: {
        page,
        limit,
        total
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get a customer's full overview (details, orders, wishlist, cart) - Admin only
export const getCustomerOverview = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Admin-only access
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({ status: 0, message: 'Forbidden: Admin access required' });
      return;
    }

    const { customerId } = req.params as { customerId?: string };
    if (!customerId) {
      res.status(400).json({ status: 0, message: 'Customer ID is required in URL parameters' });
      return;
    }

    // Fetch the customer with basic relations
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        user: {
          select: {
            id: true, email: true, contact: true, role: true, status: true, createdAt: true, updatedAt: true
          }
        },
        address: true,
      }
    });

    if (!customer) {
      res.status(404).json({ status: 0, message: 'Customer not found' });
      return;
    }

    // Parallel fetch of orders, wishlist, and cart
    const [orders, wishlist, cart] = await Promise.all([
      prisma.orders.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: 'desc' },
        include: {
          course: { select: { id: true, name: true, price: true } },
          discountCoupon: { select: { id: true, couponId: true, amount: true, amountType: true } }
        }
      }),
      prisma.wishlist.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: 'desc' },
        include: {
          course: { select: { id: true, name: true, image: true, price: true, status: true } }
        }
      }),
      prisma.cart.findMany({
        where: { userId: customer.userId },
        orderBy: { createdAt: 'desc' },
        include: {
          course: { select: { id: true, name: true, image: true, price: true, status: true } }
        }
      })
    ]);

    res.status(200).json({
      status: 1,
      message: 'Customer overview retrieved successfully',
      data: {
        customer: {
          id: customer.id,
          name: customer.name,
          status: customer.status,
          referalCode:customer.referalCode,
          createdAt: customer.createdAt,
          updatedAt: customer.updatedAt,
          user: customer.user,
          address: customer.address,
        },
        orders,
        wishlist: wishlist.map(w => ({
          id: w.id,
          course: w.course,
          status: w.status,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
        })),
        cart: cart.map(c => ({
          id: c.id,
          course: c.course,
          status: c.status,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        }))
      }
    });
  } catch (error) {
    next(error);
  }
};

// List all admins (admin-only)
export const listAdmins = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Enforce admin-only access
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({
        status: 0,
        message: 'Forbidden: Admin access required'
      });
      return;
    }

    const { status, search } = req.query as {
      status?: 'ACTIVE' | 'INACTIVE';
      search?: string;
    };
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);

    const where: any = {};
    if (status === 'ACTIVE' || status === 'INACTIVE') {
      where.status = status;
    }
    if (search && search.trim().length > 0) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { contact: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [admins, total] = await Promise.all([
      prisma.admin.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              contact: true,
              role: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            }
          },
          address: true,
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.admin.count({ where })
    ]);

    res.status(200).json({
      status: 1,
      message: admins.length > 0 ? 'Admins retrieved successfully' : 'No admins found',
      data: admins.map(a => ({
        id: a.id,
        name: a.name,
        status: a.status,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        user: a.user,
        address: a.address,
      })),
      pagination: { page, limit, total }
    });
  } catch (error) {
    next(error);
  }
};

// List all staff (admin-only)
export const listStaff = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Enforce admin-only access
    if (req.user?.role !== 'ADMIN') {
      res.status(403).json({
        status: 0,
        message: 'Forbidden: Admin access required'
      });
      return;
    }

    const { status, search } = req.query as {
      status?: 'ACTIVE' | 'INACTIVE';
      search?: string;
    };
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);

    const where: any = {};
    if (status === 'ACTIVE' || status === 'INACTIVE') {
      where.status = status;
    }
    if (search && search.trim().length > 0) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { contact: { contains: search, mode: 'insensitive' } } }
      ];
    }

    const [staff, total] = await Promise.all([
      prisma.staff.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              contact: true,
              role: true,
              status: true,
              createdAt: true,
              updatedAt: true,
            }
          },
          address: true,
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.staff.count({ where })
    ]);

    res.status(200).json({
      status: 1,
      message: staff.length > 0 ? 'Staff retrieved successfully' : 'No staff found',
      data: staff.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        user: s.user,
        address: s.address,
      })),
      pagination: { page, limit, total }
    });
  } catch (error) {
    next(error);
  }
};

