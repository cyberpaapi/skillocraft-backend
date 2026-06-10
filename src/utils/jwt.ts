import jwt, { SignOptions } from 'jsonwebtoken';
import { TokenPayload, UserResponse } from '../types';

export const generateTokens = (user: UserResponse) => {
  // Ensure JWT secrets are defined
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT secret is not defined');
  }

  if (!process.env.JWT_REFRESH_SECRET) {
    throw new Error('JWT refresh secret is not defined');
  }

  const accessTokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role
  };

  const refreshTokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role
  };

  const accessTokenOptions: SignOptions = {
    expiresIn: '1d',
    issuer: 'skillocraft-backend'
  };

  const refreshTokenOptions: SignOptions = {
    expiresIn: '7d', // Long-lived refresh token
    issuer: 'skillocraft-backend'
  };

  const accessToken = jwt.sign(
    accessTokenPayload, 
    process.env.JWT_SECRET, 
    accessTokenOptions
  );

  const refreshToken = jwt.sign(
    refreshTokenPayload, 
    process.env.JWT_REFRESH_SECRET, 
    refreshTokenOptions
  );

  return {
    accessToken,
    refreshToken
  };
};

export const verifyAccessToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(
      token, 
      process.env.JWT_SECRET || ''
    ) as TokenPayload;
  } catch (error) {
    return null;
  }
};

export const verifyRefreshToken = (token: string): TokenPayload | null => {
  try {
    return jwt.verify(
      token, 
      process.env.JWT_REFRESH_SECRET || ''
    ) as TokenPayload;
  } catch (error) {
    return null;
  }
};

export const decodeToken = (token: string): TokenPayload | null => {
  return jwt.decode(token) as TokenPayload | null;
};