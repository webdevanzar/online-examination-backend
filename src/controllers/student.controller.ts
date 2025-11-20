import { Request, Response, NextFunction } from "express";
import {
  LoginSchema,
  LoginSchemaType,
  RegisterSchema,
  RegisterSchemaType,
} from "../zodschemas";
import { Student } from "../entity/Student.entity";
import { AppError } from "../utils/ErrorHandler";
import bcrypt from "bcrypt";
import { NotificationProfile } from "../entity/NotificationProfile.entity";
import { invalidateToken, signToken } from "../utils/jwt";
import { handleUpload } from "../config/cloudinary";
import { hashPassword } from "../utils/hashPassword";

export const studentLogin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Validate request body
    const parsedResult = LoginSchema.safeParse(req.body);
    if (!parsedResult.success) {
      next(parsedResult.error);
    }

    const { email, password, rememberMe } =
      parsedResult.data as LoginSchemaType;

    // Find Auth record
    const student = await Student.findOne({
      where: { email },
    });

    if (!student) {
      throw new AppError("Invalid credentials", 403);
    }

    // Compare password
    const isValid = await bcrypt.compare(password, student.password);
    if (!isValid) {
      throw new AppError("Invalid credentials (password)", 403);
    }

    //notification count
    const unreadNotificationCount = await NotificationProfile.count({
      where: {
        student: { id: student.id },
        isRead: false,
      },
    });

    // Generate access token (short-lived JWT)
    const tokenPayload = {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
    };
    const accessTokenData = signToken(tokenPayload, true, rememberMe);
    const refreshTokenData = signToken(tokenPayload, false, rememberMe);

    // Set JWT cookies
    res.cookie("accessToken", accessTokenData.token, {
      httpOnly: true,
      secure: true,
      // secure: process.env.NODE_ENV === "production",
      // sameSite: "strict",
      sameSite: "none",
      maxAge: accessTokenData.maxAge,
    });

    res.cookie("refreshToken", refreshTokenData.token, {
      httpOnly: true,
      // secure: process.env.NODE_ENV === "production",
      secure: true,
      // sameSite: "strict",
      sameSite: "none",
      maxAge: refreshTokenData.maxAge,
    });

    return res.status(200).json({
      message: "Login successful",
      accessToken: accessTokenData.token,
      refreshToken: refreshTokenData.token,
      user: {
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        phoneNumber: student.phoneNumber,
        profileImage: student.profileImage,
        dob: student.dob,
        gender: student.gender,
        selfieVideo: student.selfieVideo,
        createdAt: student.createdAt,
        updatedAt: student.updatedAt,
        unreadNotificationCount,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const studentLogout = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const accessToken = req.cookies?.accessToken;
    const refreshToken = req.cookies?.refreshToken;

    // Add tokens to blacklist
    if (accessToken) invalidateToken(accessToken);
    if (refreshToken) invalidateToken(refreshToken);

    // Clear cookies
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};

export const studentRegister = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    console.log("Registering user...");
    const parsedResult = RegisterSchema.safeParse(req.body);
    if (!parsedResult.success) {
      next(parsedResult.error);
    }
    const { email, password, fullName, phoneNumber, gender, dob } =
      parsedResult.data as RegisterSchemaType;

    // Check if email already exists
    const isExisting = await Student.findOneBy({ email });
    if (isExisting) {
      throw new AppError("Email already in use", 409);
    }

    //upload profile image
    let uploadedImage: { secure_url: string; public_id: string } | undefined;
    if (req.file) {
      if (!req.file.mimetype.startsWith("image/")) {
        throw new AppError("Only image files are allowed", 400);
      }

      // Upload to Cloudinary once
      const result = await handleUpload(req.file.buffer);

      if (!result || !result.secure_url || !result.public_id) {
        throw new AppError("Cloudinary upload failed", 400);
      }

      uploadedImage = {
        secure_url: result.secure_url,
        public_id: result.public_id,
      };
    }

    //upload selfie video
    let uploadedVideo: { secure_url: string; public_id: string } | undefined;
    if (req.file) {
      if (!req.file.mimetype.startsWith("video/")) {
        throw new AppError("Only video files are allowed", 400);
      }

      // Upload to Cloudinary once
      const result = await handleUpload(req.file.buffer);

      if (!result || !result.secure_url || !result.public_id) {
        throw new AppError("Cloudinary upload failed", 400);
      }

      uploadedVideo = {
        secure_url: result.secure_url,
        public_id: result.public_id,
      };
    }

    //hash password
    const hashedPassword = await hashPassword(password);

    const authData = Student.create({
      email,
      fullName,
      phoneNumber,
      gender,
      dob,
      profileImage: uploadedImage?.secure_url,
      profileImagePublicId: uploadedImage?.public_id,
      selfieVideo: uploadedVideo?.secure_url,
      selfieVideoPublicId: uploadedVideo?.public_id,
      password: hashedPassword,
    });
    await authData.save();
    res.status(201).json({ message: "Student registered successfully" });
  } catch (error) {
    next(error);
  }
};
