import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { JwtUserPayload } from '../models';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET as string;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export const generateToken = (payload: JwtUserPayload): string => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
};

export const verifyToken = (token: string): JwtUserPayload | null => {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtUserPayload;
  } catch (error) {
    return null;
  }
};