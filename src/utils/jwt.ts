import jwt from "jsonwebtoken";
import memoryCache from "memory-cache";

const JWT_SECRET = process.env.JWT_SECRET as string;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}

export interface JwtPayload {
  id: string;
  fullName: string;
  email: string;
}

declare global {
  namespace Express {
    export interface Request {
      user?: {
        id: string;
        fullName: string;
        email: string;
      };
    }
  }
}

export const signToken = (
  payload: JwtPayload,
  isShortLived: boolean,
  rememberMe: boolean = false
): { token: string; maxAge: number } => {
  let expiresIn: number;

  if (isShortLived) {
    expiresIn = rememberMe ? 7 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000; // 7 days or 1 hour
  } else {
    expiresIn = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000; // 30 days or 7 days
  }

  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: Math.floor(expiresIn / 1000),
    algorithm: "HS256",
  });

  return { token, maxAge: expiresIn };
};

export const verifyToken = (token: string): JwtPayload => {
  // check if blacklisted
  if (memoryCache.get(token)) {
    throw new Error("Token has been invalidated");
  }

  return jwt.verify(token, JWT_SECRET) as JwtPayload;
};

export const invalidateToken = (token: string): void => {
  // decode token to get expiration
  const decoded = jwt.decode(token) as jwt.JwtPayload | null;

  if (!decoded || !decoded.exp) {
    throw new Error("Invalid token");
  }

  // store token in blacklist until it expires
  const timeToExpire = decoded.exp * 1000 - Date.now();
  memoryCache.put(token, true, timeToExpire);
};
