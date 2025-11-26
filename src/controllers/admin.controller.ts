import { NextFunction, Request, Response } from "express";
import {
  AdminRegisterSchema,
  AdminRegisterSchemaType,
  CreateExamSchema,
  CreateQuestionSchema,
  LoginSchema,
  LoginSchemaType,
  LogCheatEventSchema,
  UpdateAdminSchema,
  UpdateAdminSchemaType,
  UpdateExamSchema,
  UpdateQuestionSchema,
} from "../zodschemas";
import { Admin } from "../entity/Admin.entity";
import { AppError } from "../utils/ErrorHandler";
import bcrypt from "bcrypt";
import { invalidateToken, signToken } from "../utils/jwt";
import { handleDelete, handleUpload } from "../config/cloudinary";
import { hashPassword } from "../utils/hashPassword";
import { Exam } from "../entity/Exam.entity";
import { Option } from "../entity/Option.entity";
import { Question, QuestionType } from "../entity/Question.entity";
import { ExamAttempt } from "../entity/ExamAttempt.entity";
import { CheatEvent } from "../entity/CheatEvent.entity";
import { Student } from "../entity/Student.entity";

export const adminLogin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // Validate request body
    const parsedResult = LoginSchema.safeParse(req.body);
    if (!parsedResult.success) {
      return next(parsedResult.error);
    }

    const { email, password, rememberMe } =
      parsedResult.data as LoginSchemaType;

    // Find Auth record
    const admin = await Admin.findOne({
      where: { email },
    });

    if (!admin) {
      throw new AppError("Invalid credentials", 401);
    }

    // Compare password
    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      throw new AppError("Invalid credentials", 401);
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
      return next(parsedResult.error);
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

export const adminProfileUpdate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const parsedResult = UpdateAdminSchema.safeParse(req.body);
    if (!parsedResult.success) {
      return next(parsedResult.error);
    }

    const { email, fullName } = parsedResult.data as UpdateAdminSchemaType;

    const admin = await Admin.findOneBy({ id: req.user.id });
    if (!admin) {
      throw new AppError("Admin not found", 404);
    }
    if (email && email !== admin.email) {
      const isExisting = await Admin.findOne({ where: { email } });
      if (isExisting) {
        throw new AppError("Email already in use", 409);
      }
      admin.email = email;
    }
    if (fullName) admin.fullName = fullName;

    await admin.save();

    res
      .status(200)
      .json({ message: "Admin updated successfully", user: admin });
  } catch (error) {
    next(error);
  }
};

export const addAdminProfileImage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const admin = await Admin.findOneBy({ id: req.user.id });
    if (!admin) {
      throw new AppError("Admin not found", 404);
    }

    if (admin.profileImagePublicId) {
      try {
        await handleDelete(admin.profileImagePublicId);
      } catch (error) {
        throw new AppError("Failed to delete previous image", 400);
      }
    }

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

    if (uploadedImage) {
      admin.profileImage = uploadedImage.secure_url;
      admin.profileImagePublicId = uploadedImage.public_id;
    }

    await admin.save();

    res.status(200).json({
      message: "Admin profile image added successfully",
      user: admin,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAdminProfileImage = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const admin = await Admin.findOneBy({ id: req.user.id });
    if (!admin) {
      throw new AppError("Admin not found", 404);
    }

    if (admin.profileImagePublicId) {
      try {
        await handleDelete(admin.profileImagePublicId);
      } catch (error) {
        throw new AppError("Failed to delete previous image", 400);
      }
    }

    admin.profileImage = null;
    admin.profileImagePublicId = null;

    await admin.save();

    res.status(200).json({
      message: "Admin profile image deleted successfully",
      user: admin,
    });
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
      return next(parsed.error);
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

export const getExamQuestions = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const examId = req.params.examId;

    const questions = await Question.find({
      where: { exam: { id: examId } },
      relations: ["options"],
    });

    return res.json({ questions });
  } catch (err) {
    next(err);
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
      return next(parsed.error);
    }

    const data = parsed.data;

    const examId = req.params.examId;

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

    // Check if exam has already started
    const now = new Date();
    const examStartTime = new Date(exam.startTime);

    if (now >= examStartTime) {
      throw new AppError("Cannot update exam after it has started", 400);
    }

    // Only allow updating time-related fields before exam starts
    // Prevent updating if trying to change time to past
    if (data.startTime) {
      const newStartTime = new Date(data.startTime);
      if (newStartTime < now) {
        throw new AppError("Cannot set exam start time to past", 400);
      }
    }

    if (data.endTime) {
      const newEndTime = new Date(data.endTime);
      const startTime = data.startTime ? new Date(data.startTime) : examStartTime;
      if (newEndTime <= startTime) {
        throw new AppError("End time must be after start time", 400);
      }
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
    const examId = req.params.examId;

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

    // Check exam exists and verify ownership
    const exam = await Exam.findOne({
      where: { id: examId },
      relations: ["createdBy", "questions"]
    });
    if (!exam) throw new AppError("Exam not found", 404);

    if (exam.createdBy.id !== req.user.id) {
      throw new AppError("You cannot modify this exam", 403);
    }

    // Calculate current total marks of existing questions
    const currentTotalMarks = exam.questions?.reduce((sum, q) => sum + q.marks, 0) || 0;

    // Check if adding this question would exceed exam total marks
    if (currentTotalMarks + data.marks > exam.totalMarks) {
      throw new AppError(
        `Cannot add question. Total marks would be ${currentTotalMarks + data.marks} which exceeds exam total marks of ${exam.totalMarks}. Remaining marks: ${exam.totalMarks - currentTotalMarks}`,
        400
      );
    }

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

    // Calculate new total marks after adding this question
    const newTotalMarks = currentTotalMarks + data.marks;

    res.status(201).json({
      message: "Question created successfully",
      questionId: question.id,
      currentTotalMarks: newTotalMarks,
      examTotalMarks: exam.totalMarks,
      remainingMarks: exam.totalMarks - newTotalMarks,
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
      relations: ["options", "exam", "exam.questions"],
    });

    if (!question) throw new AppError("Question not found", 404);

    // If marks are being updated, validate against exam total marks
    if (data.marks !== undefined && data.marks !== question.marks) {
      const exam = question.exam;

      // Calculate total marks of all questions except this one
      const otherQuestionsMarks = exam.questions
        ?.filter((q) => q.id !== questionId)
        .reduce((sum, q) => sum + q.marks, 0) || 0;

      // Check if new total would exceed exam total marks
      const newTotalMarks = otherQuestionsMarks + data.marks;

      if (newTotalMarks > exam.totalMarks) {
        throw new AppError(
          `Cannot update question marks. Total marks would be ${newTotalMarks} which exceeds exam total marks of ${exam.totalMarks}. Available marks for this question: ${exam.totalMarks - otherQuestionsMarks}`,
          400
        );
      }
    }

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

    // Calculate and return updated totals
    const exam = await Exam.findOne({
      where: { id: question.exam.id },
      relations: ["questions"],
    });

    const currentTotalMarks = exam?.questions?.reduce((sum, q) => sum + q.marks, 0) || 0;

    res.json({
      message: "Question updated successfully",
      currentTotalMarks,
      examTotalMarks: exam?.totalMarks,
      remainingMarks: (exam?.totalMarks || 0) - currentTotalMarks,
    });
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

//terminate attempt
export const terminateAttempt = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const attempt = await ExamAttempt.findOne({
      where: { id: req.params.attemptId },
    });

    if (!attempt) throw new AppError("Attempt not found", 404);

    attempt.isSubmitted = true;
    attempt.submittedAt = new Date();

    await attempt.save();

    return res.json({ message: "Attempt terminated" });
  } catch (err) {
    next(err);
  }
};

export const logCheatEvent = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { attemptId } = req.params;

    const parsed = LogCheatEventSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const { eventType, confidence, screenshot } = parsed.data;

    const attempt = await ExamAttempt.findOne({ where: { id: attemptId } });
    if (!attempt) throw new AppError("Attempt not found", 404);

    const evt = CheatEvent.create({
      attempt,
      eventType,
      confidence,
      screenshot,
    });

    await evt.save();

    return res.json({ message: "Event logged" });
  } catch (err) {
    next(err);
  }
};

// =================== GET ALL STUDENTS ===================
export const getAllStudents = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const students = await Student.find({
      select: [
        "id",
        "fullName",
        "email",
        "phoneNumber",
        "profileImage",
        "dob",
        "gender",
        "selfieVideo",
        "createdAt",
        "updatedAt",
      ],
    });

    res.json(students);
  } catch (err) {
    next(err);
  }
};

// =================== GET SINGLE STUDENT ===================
export const getStudentById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findOne({
      where: { id: studentId },
      select: [
        "id",
        "fullName",
        "email",
        "phoneNumber",
        "profileImage",
        "dob",
        "gender",
        "selfieVideo",
        "createdAt",
        "updatedAt",
      ],
    });

    if (!student) {
      throw new AppError("Student not found", 404);
    }

    res.json(student);
  } catch (err) {
    next(err);
  }
};

// =================== GET ALL EXAMS ===================
export const getAllExams = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const exams = await Exam.find({
      relations: ["createdBy", "questions"],
      order: { createdAt: "DESC" },
    });

    // Calculate question count for each exam
    const examsWithCount = exams.map(exam => ({
      ...exam,
      questionCount: exam.questions?.length || 0,
    }));

    res.json(examsWithCount);
  } catch (err) {
    next(err);
  }
};

// =================== GET SINGLE EXAM ===================
export const getExamById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { examId } = req.params;

    const exam = await Exam.findOne({
      where: { id: examId },
      relations: ["createdBy", "questions"],
    });

    if (!exam) {
      throw new AppError("Exam not found", 404);
    }

    // Calculate question count
    const examWithCount = {
      ...exam,
      questionCount: exam.questions?.length || 0,
    };

    res.json(examWithCount);
  } catch (err) {
    next(err);
  }
};

// =================== GET EXAM ATTEMPTS ===================
export const getExamAttempts = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { examId } = req.params;

    const attempts = await ExamAttempt.find({
      where: { exam: { id: examId } },
      relations: ["student", "exam"],
      order: { startedAt: "DESC" },
    });

    res.json(attempts);
  } catch (err) {
    next(err);
  }
};
