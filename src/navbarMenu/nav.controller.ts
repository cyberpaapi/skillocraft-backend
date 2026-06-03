import { Response, NextFunction } from "express";
import { AuthRequest } from '../types';
import prisma from "../db/db.config";

/**
 * Get user navigation data including cart count and notification count
 * This endpoint requires authentication token but no request data
 * Returns cart item count and notification count (currently hardcoded to 0)
 */
export const getUserNavData = async (
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
            where: { email: req.user.email }
        });

        // Check if user exists
        if (!user) {
            res.status(404).json({
                status: 0,
                message: 'User not found'
            });
            return;
        }

        // Count active cart items for the user
        const cartCount = await prisma.cart.count({
            where: {
                userId: user.id,
                status: 'ACTIVE'
            }
        });

        // For now, notification count is hardcoded to 0 as requested
        // This can be enhanced later to count actual notifications
        const notificationCount = 0;

        // Return the navigation data
        res.status(200).json({
            status: 1,
            message: 'Navigation data retrieved successfully',
            data: {
                cartCount,
                notificationCount
            }
        });

    } catch (error) {
        console.error('Error getting user navigation data:', error);
        res.status(500).json({
            status: 0,
            message: 'Internal server error',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
    }
};