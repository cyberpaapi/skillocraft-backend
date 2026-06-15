import { Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

export const createMarketplaceOrder = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user || req.user.role !== 'CUSTOMER') {
      return res.status(403).json({ status: 0, message: 'Customer login required' });
    }

    const customer = await prisma.customer.findFirst({
      where: { userId: req.user.id },
      select: { id: true },
    });
    if (!customer) return res.status(404).json({ status: 0, message: 'Customer not found' });

    const { productId, quantity = 1, recipientName, phone, addressLine, city, state, pinCode, country } = req.body;

    if (!productId || !addressLine || !pinCode) {
      return res.status(400).json({ status: 0, message: 'productId, addressLine, and pinCode are required' });
    }

    const product = await prisma.marketplaceProduct.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ status: 0, message: 'Product not found' });

    const totalAmount = String((parseFloat(product.price) * Number(quantity)).toFixed(2));

    const order = await prisma.marketplaceOrder.create({
      data: {
        customerId: customer.id,
        productId,
        quantity: Number(quantity),
        totalAmount,
        recipientName: recipientName || null,
        phone: phone || null,
        addressLine,
        city: city || null,
        state: state || null,
        pinCode,
        country: country || null,
      },
    });

    return res.status(201).json({ status: 1, message: 'Order placed successfully', data: order });
  } catch (error) {
    next(error);
  }
};

export const listMarketplaceOrders = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ status: 0, message: 'Unauthorized' });
    }

    const { page = 1, limit = 50, status } = req.query;
    const where: any = {};
    if (status) where.status = status;

    const [orders, total] = await Promise.all([
      prisma.marketplaceOrder.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              user: { select: { email: true } },
            },
          },
          product: {
            select: { id: true, name: true, images: true, price: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
      }),
      prisma.marketplaceOrder.count({ where }),
    ]);

    return res.json({
      status: 1,
      data: { orders, total, page: Number(page), limit: Number(limit) },
    });
  } catch (error) {
    next(error);
  }
};

export const updateMarketplaceOrderStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ status: 0, message: 'Unauthorized' });
    }

    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ status: 0, message: 'Invalid status value' });
    }

    const order = await prisma.marketplaceOrder.update({
      where: { id },
      data: { status },
    });

    return res.json({ status: 1, message: 'Status updated', data: order });
  } catch (error) {
    next(error);
  }
};
