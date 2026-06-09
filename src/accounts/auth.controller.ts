import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import https from 'https';
import prisma from '../db/db.config';
import { registerSchema, loginSchema, passwordUpdateSchema } from '../schemas/auth.schema';
import { generateTokens, verifyRefreshToken } from '../utils/jwt';
import { AuthRequest, Role } from '../types';
import { ZodError } from 'zod';

/**
 * Register a new staff member
 */
const registerStaff = async (userId: string, name: string, roleId: string) => {
  if (!roleId) {
    throw new Error('Role ID is required for staff registration');
  }

  // Check if the role exists
  const roleExists = await prisma.staffRole.findUnique({
    where: { id: roleId }
  });

  if (!roleExists) {
    throw new Error('Specified role does not exist');
  }

  return await prisma.staff.create({
    data: {
      userId,
      name,
      roleId
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
};

const extractUserName = async (user: any, role: Role, fallbackName?: string) => {
  let userName;
  
  switch (role) {
    case 'ADMIN':
      const admin = await prisma.admin.findUnique({ 
        where: { id: user.id },
        select: { name: true }
      });
      userName = admin?.name;
      break;
    case 'CUSTOMER':
      const customer = await prisma.customer.findUnique({ 
        where: { id: user.id },
        select: { name: true }
      });
      userName = customer?.name;
      break;
    case 'STAFF':
      const staff = await prisma.staff.findUnique({ 
        where: { id: user.id },
        select: { name: true }
      });
      userName = staff?.name;
      break;
  }

  return userName || fallbackName || user.email.split('@')[0];
};

export const registerUser = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Validate input
    const validatedData = registerSchema.parse(req.body);
    const { email, password, name, role, contact } = validatedData;
    const roleId = validatedData.role === 'STAFF' ? validatedData.roleId : undefined;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(400).json({ error: 'User already exists' });
      return;
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user with role
    const user = await prisma.user.create({
      data: {
        email,
        contact,
        password: hashedPassword,
        role
      }
    });

    // Create role-specific profile
    let userProfile;
    switch (role) {
      case 'CUSTOMER':
        // Generate referral code: first 3 letters of email + last 3 digits of contact + current date
        const emailPrefix = email.substring(0, 3).toUpperCase();
        const contactSuffix = contact.slice(-3);
        const dateSuffix = new Date().toISOString().slice(2, 10).replace(/-/g, '');
        let referalCode = `${emailPrefix}${contactSuffix}${dateSuffix}`;
        // Ensure the referral code is unique
        let isUnique = false;
        let attempt = 1;
        while (!isUnique && attempt <= 5) { // Try 5 times max to avoid infinite loop
          try {
            userProfile = await prisma.customer.create({
              data: {
                userId: user.id,
                name,
                referalCode,
                status: 'ACTIVE' // Make sure to set the status
              }
            });
            isUnique = true;
          } catch (error: unknown) {
            // Type guard to check if it's a Prisma error
            const isPrismaError = (e: any): e is { code: string; meta?: { target?: string[] } } => {
              return e && typeof e === 'object' && 'code' in e;
            };

            if (isPrismaError(error) && error.code === 'P2002' && 
                error.meta?.target?.includes('referalCode')) {
              // If code exists, append a random character and try again
              referalCode = `${emailPrefix}${contactSuffix}${dateSuffix}${Math.random().toString(36).substring(2, 3).toUpperCase()}`;
              attempt++;
            } else {
              throw error; // Re-throw other errors
            }
          }
        }
        if (!isUnique) {
          throw new Error('Failed to generate a unique referral code after multiple attempts');
        }

        // Track referral if a referral code was provided at signup
        const incomingReferralCode = req.body.referralCode as string | undefined;
        if (incomingReferralCode && userProfile) {
          const referrerCustomer = await prisma.customer.findUnique({
            where: { referalCode: incomingReferralCode }
          });
          if (referrerCustomer && referrerCustomer.id !== userProfile.id) {
            try {
              await prisma.referal.create({
                data: {
                  referrerId: referrerCustomer.id,
                  referredId: userProfile.id,
                  referalCode: incomingReferralCode
                }
              });
            } catch {
              // Silently ignore duplicate referral (already referred)
            }
          }
        }
        break;
      case 'STAFF':
        try {
          userProfile = await registerStaff(user.id, name, roleId as string);
        } catch (error: any) {
          // Rollback user creation if staff creation fails
          await prisma.user.delete({ where: { id: user.id } });
          throw error;
        }
        break;
      case 'ADMIN':
        userProfile = await prisma.admin.create({
          data: {
            userId: user.id,
            name
          }
        });
        break;
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens({
      ...user,
      name: userProfile?.name || name
    });

    // Optional: Store refresh token in database
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        refreshToken: refreshToken 
      }
    });

    // Determine user's name
    const userName = await extractUserName(user, role, name);

    res.status(201).json({ 
      message: 'User registered successfully',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: userName,
        contact,
        role: user.role
      }
    });
  } catch (error) {
    if (error instanceof ZodError) {
      // Handle validation errors
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

export const loginUser = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Validate input
    const validatedData = loginSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: validatedData.email }
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      validatedData.password, 
      user.password
    );

    if (!isPasswordValid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Extract name based on role
    const userName = await extractUserName(user, user.role);

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens({
      ...user,
      name: userName
    });

    // Optional: Store refresh token in database
    await prisma.user.update({
      where: { id: user.id },
      data: { 
        refreshToken: refreshToken 
      }
    });

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: userName,
        contact: user.contact,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

export const refreshTokens = async (
  req: Request, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {

        // // Get refresh token from Authorization header
        // const authHeader = req.headers.authorization;
        // if (!authHeader || !authHeader.startsWith('Bearer ')) {
        //   res.status(401).json({ error: 'No refresh token provided in Authorization header' });
        //   return;
        // }
        
        // const refreshToken = authHeader.split(' ')[1]; // Get token after 'Bearer '

    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(401).json({ error: 'Refresh token is required' });
      return;
    }

    // Verify refresh token
    const decoded = verifyRefreshToken(refreshToken);

    if (!decoded) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    // Find user and verify stored refresh token
    const user = await prisma.user.findUnique({
      where: { 
        id: decoded.userId,
        refreshToken: refreshToken 
      }
    });

    if (!user) {
      res.status(401).json({ error: 'User not found or refresh token invalidated' });
      return;
    }

    // Extract name based on role
    const userName = await extractUserName(user, user.role);

    // Generate new tokens
    const { 
      accessToken: newAccessToken, 
      refreshToken: newRefreshToken 
    } = generateTokens({
      ...user,
      name: userName
    });

    // Update refresh token in database
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken }
    });

    res.json({
      message: 'Tokens refreshed successfully',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: userName,
        contact: user.contact,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
};

export const logoutUser = async (
  req: AuthRequest, 
  res: Response, 
  next: NextFunction
): Promise<void> => {
  try {
    // Ensure user is authenticated
    if (!req.user?.id) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Clear refresh token from database
    await prisma.user.update({
      where: { id: req.user.id },
      data: { refreshToken: null }
    });

    res.json({ message: 'Logout successful' });
  } catch (error) {
    next(error);
  }
};

export const updatePassword = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Validate input
    const { currentPassword, newPassword } = passwordUpdateSchema.parse(req.body);
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        status: 0,
        message: 'Authentication required'
      });
      return;
    }

    // Get the user with the hashed password
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true }
    });

    if (!user) {
      res.status(404).json({
        status: 0,
        message: 'User not found'
      });
      return;
    }

    // Verify current password
    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      res.status(400).json({
        status: 0,
        message: 'Current password is incorrect'
      });
      return;
    }

    // Hash the new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update the password
    await prisma.user.update({
      where: { id: userId },
      data: { 
        password: hashedPassword,
        updatedAt: new Date()
      }
    });

    // Invalidate all refresh tokens (optional but recommended for security)
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null }
    });

    res.status(200).json({
      status: 1,
      message: 'Password updated successfully'
    });
  } catch (error) {
    if (error instanceof ZodError) {
      res.status(400).json({
        status: 0,
        message: 'Validation error',
        errors: error.errors.map(err => ({
          code: err.code,
          path: err.path,
          message: err.message
        }))
      });
    } else {
      console.error('Error updating password:', error);
      res.status(500).json({
        status: 0,
        message: 'An error occurred while updating the password'
      });
    }
  }
};

const fetchGoogleTokenInfo = (credential: string): Promise<any> =>
  new Promise((resolve, reject) => {
    https.get(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`, (res) => {
      let raw = '';
      res.on('data', (c) => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error('Bad Google response')); }
      });
    }).on('error', reject);
  });

export const googleLogin = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { credential } = req.body;
    if (!credential) {
      res.status(400).json({ message: 'Google credential required' });
      return;
    }

    const googleData = await fetchGoogleTokenInfo(credential);

    if (googleData.error || !googleData.email) {
      res.status(400).json({ message: 'Invalid Google token' });
      return;
    }

    if (process.env.GOOGLE_CLIENT_ID && googleData.aud !== process.env.GOOGLE_CLIENT_ID) {
      res.status(400).json({ message: 'Token audience mismatch' });
      return;
    }

    const { email, name, sub: googleId, picture } = googleData;

    let user = await prisma.user.findUnique({
      where: { email },
      include: { customer: true },
    });

    if (!user) {
      const emailPrefix = email.substring(0, 3).toUpperCase();
      const dateSuffix = Date.now().toString(36).toUpperCase();
      const referalCode = `G${emailPrefix}${dateSuffix}`;

      user = await prisma.user.create({
        data: {
          email,
          contact: '',
          password: `GOOGLE_${googleId}`,
          role: 'CUSTOMER',
          loginType: 'GOOGLE',
          avatarUrl: picture || null,
          customer: {
            create: {
              name: name || email.split('@')[0],
              referalCode,
            },
          },
        },
        include: { customer: true },
      });
    }

    const customerName = user.customer?.[0]?.name || name || email.split('@')[0];
    const { accessToken, refreshToken } = generateTokens({ ...user, name: customerName });

    await prisma.user.update({ where: { id: user.id }, data: { refreshToken } });

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: { id: user.id, name: customerName, email: user.email, role: user.role },
    });
  } catch (error) {
    next(error);
  }
};