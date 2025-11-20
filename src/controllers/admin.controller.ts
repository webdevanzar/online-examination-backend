import { NextFunction, Request, Response } from "express";
import {
  AdminRegisterSchema,
  AdminRegisterSchemaType,
  CreateExamSchema,
  CreateQuestionSchema,
  LoginSchema,
  LoginSchemaType,
  RegisterSchema,
  UpdateExamSchema,
  UpdateQuestionSchema,
} from "../zodschemas";
import { Admin } from "../entity/Admin.entity";
import { AppError } from "../utils/ErrorHandler";
import bcrypt from "bcrypt";
import { invalidateToken, signToken } from "../utils/jwt";
import { handleUpload } from "../config/cloudinary";
import { hashPassword } from "../utils/hashPassword";
import { Exam } from "../entity/Exam.entity";
import { Option } from "../entity/Option.entity";
import { Question, QuestionType } from "../entity/Question.entity";

export const adminLogin = async (
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
    const admin = await Admin.findOne({
      where: { email },
    });

    if (!admin) {
      throw new AppError("Invalid credentials", 403);
    }

    // Compare password
    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      throw new AppError("Invalid credentials (password)", 403);
    }

    // Generate access token (short-lived JWT)
    const tokenPayload = {
      id: admin.id,
      fullName: admin.fullName,
      email: admin.email,
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
        id: admin.id,
        fullName: admin.fullName,
        email: admin.email,
        profileImage: admin.profileImage,
        isActive: admin.isActive,
        createdAt: admin.createdAt,
        updatedAt: admin.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const adminLogout = async (
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

export const adminRegister = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsedResult = AdminRegisterSchema.safeParse(req.body);
    if (!parsedResult.success) {
      next(parsedResult.error);
    }
    const { email, password, fullName } =
      parsedResult.data as AdminRegisterSchemaType;

    // Check if email already exists
    const isExisting = await Admin.findOneBy({ email });
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

    //hash password
    const hashedPassword = await hashPassword(password);

    const authData = Admin.create({
      fullName,
      email,
      profileImage: uploadedImage?.secure_url,
      profileImagePublicId: uploadedImage?.public_id,
      password: hashedPassword,
    });
    await authData.save();
    res.status(201).json({ message: "Admin registered successfully" });
  } catch (error) {
    next(error);
  }
};

export const createExam = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Validate data
    const parsed = CreateExamSchema.safeParse(req.body);
    if (!parsed.success) {
      next(parsed.error);
    }

    const data = parsed.data;

    const exam = Exam.create({
      ...data,
      createdBy: { id: req.user.id } as any, // attach admin FK
    });

    await exam.save();

    res.status(201).json({
      message: "Exam created successfully",
      exam,
    });
  } catch (error) {
    next(error);
  }
};

export const updateExam = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Validate input
    const parsed = UpdateExamSchema.safeParse(req.body);
    if (!parsed.success) {
      next(parsed.error);
    }

    const data = parsed.data;

    const examId = req.params.id;

    const exam = await Exam.findOne({
      where: { id: examId },
      relations: ["createdBy"],
    });

    if (!exam) {
      throw new AppError("Exam not found", 404);
    }

    if (exam.createdBy.id !== req.user.id) {
      throw new AppError("You cannot modify this exam", 403);
    }

    // Update data
    Object.assign(exam, data);

    await exam.save();

    res.json({
      message: "Exam updated successfully",
      exam,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteExam = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const examId = req.params.id;

    if (!examId) {
      throw new AppError("Exam ID is required", 400);
    }

    // Find exam
    const exam = await Exam.findOne({
      where: { id: examId },
      relations: ["createdBy"],
    });

    if (!exam) {
      throw new AppError("Exam not found", 404);
    }

    if (exam.createdBy?.id !== req.user?.id) {
      throw new AppError("You are not allowed to delete this exam", 403);
    }

    // Delete exam
    await exam.remove(); // Or Exam.delete(examId)

    res.status(200).json({
      message: "Exam deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const createQuestion = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const examId = req.params.examId;

    const parsed = CreateQuestionSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const data = parsed.data;

    // Check exam exists
    const exam = await Exam.findOne({ where: { id: examId } });
    if (!exam) throw new AppError("Exam not found", 404);

    // Create question
    const question = Question.create({
      exam,
      type: data.type,
      questionText: data.questionText,
      marks: data.marks,
      hasMultipleCorrect: data.hasMultipleCorrect,
      answerMinLength: data.answerMinLength,
      answerMaxLength: data.answerMaxLength,
    });

    await question.save();

    // MCQ — Add options
    if (data.type === QuestionType.MCQ && data.options.length > 0) {
      const optionEntities = data.options.map((opt) =>
        Option.create({
          question,
          optionText: opt.optionText,
          isCorrect: opt.isCorrect,
        })
      );

      await Option.save(optionEntities);
    }

    res.status(201).json({
      message: "Question created successfully",
      questionId: question.id,
    });
  } catch (err) {
    next(err);
  }
};

export const updateQuestion = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const questionId = req.params.questionId;

    const parsed = UpdateQuestionSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const data = parsed.data;

    const question = await Question.findOne({
      where: { id: questionId },
      relations: ["options"],
    });

    if (!question) throw new AppError("Question not found", 404);

    // Update base fields
    Object.assign(question, data);
    await question.save();

    // If MCQ options provided → replace options
    if (data.options) {
      await Option.delete({ question: { id: question.id } });

      const newOptions = data.options.map((opt) =>
        Option.create({
          question,
          optionText: opt.optionText,
          isCorrect: opt.isCorrect,
        })
      );

      await Option.save(newOptions);
    }

    res.json({ message: "Question updated successfully" });
  } catch (err) {
    next(err);
  }
};

export const deleteQuestion = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const questionId = req.params.questionId;

    const question = await Question.findOne({ where: { id: questionId } });

    if (!question) throw new AppError("Question not found", 404);

    await question.remove();

    res.json({ message: "Question deleted successfully" });
  } catch (err) {
    next(err);
  }
};
