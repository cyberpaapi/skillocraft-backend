import { Request } from 'express';

export type Role = 'CUSTOMER' | 'STAFF' | 'ADMIN';

export enum ActiveStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE'
}

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: Role;
  };
}

export interface TokenPayload {
  id: string;
  email: string;
  role: Role;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Product {
  id: string;
  name: string;
  videoLink: string;
  status: string;
  createdBy: string;
  courseId: string;
}