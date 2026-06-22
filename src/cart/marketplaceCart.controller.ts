import { Response, NextFunction } from 'express';
import prisma from '../db/db.config';
import { AuthRequest } from '../types';

const getCustomerId = async (req: AuthRequest): Promise<string | null> => {
  if (!req.user?.id) return null;
  const customer = await prisma.customer.findFirst({ where: { userId: req.user.id }, select: { id: true } });
  return customer?.id || null;
};

// POST /marketplace-cart  { productId, quantity? }
export const addToMarketplaceCart = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const customerId = await getCustomerId(req);
    if (!customerId) { res.status(403).json({ status: 0, message: 'Customer login required' }); return; }

    const { productId } = req.body;
    const quantity = Math.max(1, Number(req.body.quantity) || 1);
    if (!productId) { res.status(400).json({ status: 0, message: 'productId is required' }); return; }

    const product = await prisma.marketplaceProduct.findUnique({ where: { id: productId } });
    if (!product) { res.status(404).json({ status: 0, message: 'Product not found' }); return; }

    const item = await prisma.marketplaceCart.upsert({
      where: { customerId_productId: { customerId, productId } },
      update: { quantity: { increment: quantity } },
      create: { customerId, productId, quantity },
    });

    res.status(200).json({ status: 1, message: 'Added to cart', data: item });
  } catch (error) {
    next(error);
  }
};

// GET /marketplace-cart
export const listMarketplaceCart = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const customerId = await getCustomerId(req);
    if (!customerId) { res.status(403).json({ status: 0, message: 'Customer login required' }); return; }

    const items = await prisma.marketplaceCart.findMany({
      where: { customerId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({
      status: 1,
      data: items.map((i) => ({
        id: i.id,
        productId: i.productId,
        quantity: i.quantity,
        name: i.product.name,
        images: i.product.images,
        price: i.product.price,
        originalPrice: i.product.originalPrice,
        discount: i.product.discount,
        category: i.product.category,
      })),
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /marketplace-cart/:id  { quantity }
export const updateMarketplaceCartItem = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const customerId = await getCustomerId(req);
    if (!customerId) { res.status(403).json({ status: 0, message: 'Customer login required' }); return; }
    const { id } = req.params;
    const quantity = Math.max(1, Number(req.body.quantity) || 1);
    const item = await prisma.marketplaceCart.findFirst({ where: { id, customerId } });
    if (!item) { res.status(404).json({ status: 0, message: 'Cart item not found' }); return; }
    const updated = await prisma.marketplaceCart.update({ where: { id }, data: { quantity } });
    res.status(200).json({ status: 1, data: updated });
  } catch (error) {
    next(error);
  }
};

// DELETE /marketplace-cart/:id
export const removeFromMarketplaceCart = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const customerId = await getCustomerId(req);
    if (!customerId) { res.status(403).json({ status: 0, message: 'Customer login required' }); return; }
    const { id } = req.params;
    const item = await prisma.marketplaceCart.findFirst({ where: { id, customerId } });
    if (!item) { res.status(404).json({ status: 0, message: 'Cart item not found' }); return; }
    await prisma.marketplaceCart.delete({ where: { id } });
    res.status(200).json({ status: 1, message: 'Removed from cart' });
  } catch (error) {
    next(error);
  }
};
