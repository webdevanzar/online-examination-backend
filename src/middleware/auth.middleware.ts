import { Request, Response, NextFunction } from "express";
import { JwtPayload } from "jsonwebtoken";
import { verifyToken, signToken } from "../utils/jwt"; // your token utils

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    console.log("auth middleware trigerred for", req.originalUrl);

    let decoded: JwtPayload | null = null;

    if (accessToken) {
      try {
        decoded = verifyToken(accessToken);
      } catch (err) {
        // access token invalid/expired
        decoded = null;
      }
    }

    if (!decoded) {
      // try refresh token
      if (!refreshToken) {
        return res.status(401).json({ message: "No valid token provided" });
      }

      try {
        const refreshDecoded = verifyToken(refreshToken);

        // Generate new access token
        const newAccessTokenData = signToken(
          { id: refreshDecoded.id, fullName: refreshDecoded.fullName, email: refreshDecoded.email },
          true // short-lived token
        );

        res.cookie("accessToken", newAccessTokenData.token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: newAccessTokenData.maxAge,
        });

        decoded = refreshDecoded;
      } catch (err) {
        return res.status(401).json({ message: "Refresh token expired or invalid" });
      }
    }

    // attach user info to request
    req.user = {
      id: decoded.id,
      fullName: decoded.fullName,
      email: decoded.email,
    };

    next();
  } catch (error: any) {
    console.error("JWT Auth Error:", error.message || error);
    return res.status(401).json({ message: error.message || "Invalid or expired token" });
  }
};
