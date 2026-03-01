import { NextFunction, Request, Response } from "express";
import {
  AdminRegisterSchema,
  AdminRegisterSchemaType,
  AdminResetPasswordSchema,
  CreateExamSchema,
  CreateQuestionSchema,
  LoginSchema,
  LoginSchemaType,
  LogCheatEventSchema,
  GradeAttemptSchema,
  SetAttemptStatusSchema,
  UpdateAdminSchema,
  UpdateAdminSchemaType,
  UpdateExamSchema,
  UpdateQuestionSchema,
  UpdateStudentSchema,
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
import { Notification, NotificationType } from "../entity/Notification.entitty";
import { NotificationProfile } from "../entity/NotificationProfile.entity";
import { CheatEvent } from "../entity/CheatEvent.entity";
import { Student } from "../entity/Student.entity";
import axios from "axios";
import { sendNewExamNotification } from "../lib/email";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export const adminLogin = async (
  req: Request,
  res: Response,
  next: NextFunction,
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

    if (admin.provider === "google") {
      throw new AppError(
        "This email is registered with google. Please use google login.",
        409,
      );
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

export const adminGoogleAuth = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { accessToken, rememberMe } = req.body;

    if (!accessToken) {
      throw new AppError("Google access token missing", 400);
    }

    // Fetch user info from Google
    const { data } = await axios.get(GOOGLE_USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const { email, name: fullName, picture } = data;

    if (!email) {
      throw new AppError("Google account has no email", 400);
    }

    const isCountReached = await Admin.count();
    if (isCountReached >= 3) {
      throw new AppError("Admin limit reached", 409);
    }

    //  Find admin by email
    let admin = await Admin.findOne({ where: { email } });

    // Existing LOCAL account → block Google login
    if (admin && admin.provider === "local") {
      throw new AppError(
        "This email is registered with password. Please use normal login.",
        409,
      );
    }

    //  Create account if not exists (Google signup)
    if (!admin) {
      admin = Admin.create({
        email,
        fullName,
        profileImage: picture,
        provider: "google",
        password: null,
        isActive: true,
      });

      await admin.save();
    }

    // Generate tokens
    const tokenPayload = {
      id: admin.id,
      fullName: admin.fullName,
      email: admin.email,
    };

    const accessTokenData = signToken(tokenPayload, true, rememberMe);
    const refreshTokenData = signToken(tokenPayload, false, rememberMe);

    //  Set cookies (same as manual login)
    res.cookie("accessToken", accessTokenData.token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: accessTokenData.maxAge,
    });

    res.cookie("refreshToken", refreshTokenData.token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: refreshTokenData.maxAge,
    });

    //  Response
    return res.status(200).json({
      message: "Google authentication successful",
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
  next: NextFunction,
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
  next: NextFunction,
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

    const isCountReached = await Admin.count();
    if (isCountReached >= 3) {
      throw new AppError("Admin limit reached", 409);
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
      provider: "local",
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
  next: NextFunction,
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
  next: NextFunction,
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
  next: NextFunction,
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
  next: NextFunction,
) => {
  try {
    // 1️⃣ Validate request body
    const parsed = CreateExamSchema.safeParse(req.body);
    if (!parsed.success) {
      return next(parsed.error);
    }

    if (!req.user?.id) {
      throw new AppError("Unauthorized", 401);
    }

    const data = parsed.data;

    // 2️⃣ Load admin entity (CRITICAL)
    const admin = await Admin.findOne({
      where: { id: req.user.id },
    });

    if (!admin) {
      throw new AppError("Admin not found", 404);
    }

    // 3️⃣ Compute duration
    const start = new Date(data.startTime);
    const end = new Date(data.endTime);

    if (end <= start) {
      throw new AppError("End time must be after start time", 400);
    }

    const durationMinutes = Math.max(
      1,
      Math.ceil((end.getTime() - start.getTime()) / (60 * 1000)),
    );

    // 4️⃣ Create exam (SAFE)
    const exam = Exam.create({
      ...data,
      duration: durationMinutes,
      createdBy: admin, // ✅ managed entity
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
  next: NextFunction,
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
  next: NextFunction,
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

    if (exam.isPublished) {
      throw new AppError("Cannot update exam after it has been published", 400);
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
      const startTime = data.startTime
        ? new Date(data.startTime)
        : examStartTime;
      if (newEndTime <= startTime) {
        throw new AppError("End time must be after start time", 400);
      }
    }

    // Track publish state before update
    const wasPublished = !!exam.isPublished;

    // If request attempts to publish, ensure questions cover all marks
    if (data.isPublished === true) {
      // compute sum of existing question marks
      const questions = await Question.find({
        where: { exam: { id: examId } },
      });
      const assignedMarks = questions.reduce(
        (sum, q) => sum + (q.marks || 0),
        0,
      );
      const targetTotal =
        data.totalMarks !== undefined ? data.totalMarks : exam.totalMarks;

      if (assignedMarks !== targetTotal) {
        const remaining = targetTotal - assignedMarks;
        throw new AppError(
          remaining > 0
            ? `Cannot publish. Remaining marks to assign: ${remaining}`
            : `Cannot publish. Assigned marks (${assignedMarks}) exceed total marks (${targetTotal}).`,
          400,
        );
      }
    }

    // Update data
    Object.assign(exam, data);

    await exam.save();

    // If exam just got published, notify all students
    if (!wasPublished && exam.isPublished) {
      // Fetch all student emails
      const students = await Student.find({
        select: ["email"],
      });

      const emails = students.map(({ email }) => email).filter(Boolean); // remove null/undefined emails

      if (!emails.length) {
        console.log("⚠️ No student emails found");
        return;
      }

      await sendNewExamNotification(emails);

      console.log(
        `📤 Exam notification email sent to ${emails.length} students`,
      );
    }

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
  next: NextFunction,
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

    if (exam.isPublished) {
      throw new AppError("Cannot delete exam after it has been published", 400);
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
  next: NextFunction,
) => {
  try {
    const examId = req.params.examId;

    const parsed = CreateQuestionSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const data = parsed.data;

    // Check exam exists and verify ownership
    const exam = await Exam.findOne({
      where: { id: examId },
      relations: ["createdBy", "questions"],
    });
    if (!exam) throw new AppError("Exam not found", 404);

    if (exam.isPublished) {
      throw new AppError("Cannot add question to published exam", 400);
    }

    if (exam.createdBy.id !== req.user.id) {
      throw new AppError("You cannot modify this exam", 403);
    }

    // Calculate current total marks of existing questions
    const currentTotalMarks =
      exam.questions?.reduce((sum, q) => sum + q.marks, 0) || 0;

    // Check if adding this question would exceed exam total marks
    if (currentTotalMarks + data.marks > exam.totalMarks) {
      throw new AppError(
        `Cannot add question. Total marks would be ${
          currentTotalMarks + data.marks
        } which exceeds exam total marks of ${
          exam.totalMarks
        }. Remaining marks: ${exam.totalMarks - currentTotalMarks}`,
        400,
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
        }),
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
  next: NextFunction,
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

    if (question.exam.isPublished) {
      throw new AppError("Cannot update question in published exam", 400);
    }

    // If marks are being updated, validate against exam total marks
    if (data.marks !== undefined && data.marks !== question.marks) {
      const exam = question.exam;

      // Calculate total marks of all questions except this one
      const otherQuestionsMarks =
        exam.questions
          ?.filter((q) => q.id !== questionId)
          .reduce((sum, q) => sum + q.marks, 0) || 0;

      // Check if new total would exceed exam total marks
      const newTotalMarks = otherQuestionsMarks + data.marks;

      if (newTotalMarks > exam.totalMarks) {
        throw new AppError(
          `Cannot update question marks. Total marks would be ${newTotalMarks} which exceeds exam total marks of ${
            exam.totalMarks
          }. Available marks for this question: ${
            exam.totalMarks - otherQuestionsMarks
          }`,
          400,
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
        }),
      );

      await Option.save(newOptions);
    }

    // Calculate and return updated totals
    const exam = await Exam.findOne({
      where: { id: question.exam.id },
      relations: ["questions"],
    });

    const currentTotalMarks =
      exam?.questions?.reduce((sum, q) => sum + q.marks, 0) || 0;

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
  next: NextFunction,
) => {
  try {
    const questionId = req.params.questionId;

    const question = await Question.findOne({ where: { id: questionId } });

    if (!question) throw new AppError("Question not found", 404);

    if (question.exam.isPublished) {
      throw new AppError("Cannot delete question from published exam", 400);
    }

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
  next: NextFunction,
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
  next: NextFunction,
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
  next: NextFunction,
) => {
  try {
    const students = await Student.find({
      // where: { isActive: true },
      select: [
        "id",
        "fullName",
        "email",
        "phoneNumber",
        "profileImage",
        "dob",
        "isActive",
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
  next: NextFunction,
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
        "isActive",
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
  next: NextFunction,
) => {
  try {
    const exams = await Exam.find({
      relations: ["createdBy", "questions"],
      order: { createdAt: "DESC" },
    });

    // Calculate question count for each exam
    const examsWithCount = exams.map((exam) => ({
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
  next: NextFunction,
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
  next: NextFunction,
) => {
  try {
    const { examId } = req.params;

    const attempts = await ExamAttempt.find({
      where: { exam: { id: examId } },
      relations: ["student", "exam", "gradedBy"],
      order: { startedAt: "DESC" },
    });

    res.json(attempts);
  } catch (err) {
    next(err);
  }
};

export const getAllAttempts = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const attempts = await ExamAttempt.find({
      relations: ["student", "exam", "gradedBy"],
      order: { startedAt: "DESC" },
    });

    return res.json(attempts);
  } catch (err) {
    next(err);
  }
};

// =================== SET MANUAL ATTEMPT STATUS ===================
export const setAttemptStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { attemptId } = req.params;
    const adminId = req.user.id;

    const parsed = SetAttemptStatusSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const { status } = parsed.data;

    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
      relations: ["student", "exam", "gradedBy"],
    });

    if (!attempt) throw new AppError("Attempt not found", 404);
    if (!attempt.isSubmitted)
      throw new AppError("Cannot grade unsubmitted attempt", 400);

    const admin = await Admin.findOne({ where: { id: adminId } });
    if (!admin) throw new AppError("Admin not found", 404);

    attempt.manualStatus = status;
    attempt.gradedBy = admin;
    attempt.gradedAt = new Date();

    await attempt.save();

    res.json({
      message: `Attempt marked as ${status}`,
      attempt: {
        id: attempt.id,
        manualStatus: attempt.manualStatus,
        gradedBy: {
          id: admin.id,
          fullName: admin.fullName,
        },
        gradedAt: attempt.gradedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getAttemptReview = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { attemptId } = req.params;

    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
      relations: [
        "student",
        "exam",
        "answers",
        "answers.question",
        "answers.selectedOptions",
        "answers.question.options",
      ],
    });

    if (!attempt) throw new AppError("Attempt not found", 404);
    if (!attempt.isSubmitted) {
      throw new AppError("Cannot review an unsubmitted attempt", 400);
    }

    const questionReviews = attempt.answers
      .sort((a, b) => {
        const aOrder = (a.question as any)?.order ?? 0;
        const bOrder = (b.question as any)?.order ?? 0;
        return aOrder - bOrder;
      })
      .map((ans) => {
        const q = ans.question;
        const options = (q.options || []).map((opt) => ({
          id: opt.id,
          text: opt.optionText,
          isCorrect: opt.isCorrect,
        }));

        return {
          answerId: ans.id,
          questionId: q.id,
          type: q.type,
          questionText: q.questionText,
          marks: q.marks,
          hasMultipleCorrect: q.hasMultipleCorrect,
          options,
          studentAnswer: {
            selectedOptionIds: ans.selectedOptions?.map((o) => o.id) ?? [],
            writtenAnswer: ans.writtenAnswer ?? null,
          },
          marksObtained: ans.marksObtained,
        };
      });

    return res.json({
      attempt: {
        id: attempt.id,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        score: attempt.score,
        manualStatus: attempt.manualStatus,
        gradedAt: attempt.gradedAt,
        student: {
          id: attempt.student.id,
          fullName: attempt.student.fullName,
          email: attempt.student.email,
        },
        exam: {
          id: attempt.exam.id,
          title: attempt.exam.title,
          totalMarks: attempt.exam.totalMarks,
          passingMarks: attempt.exam.passingMarks,
        },
      },
      questions: questionReviews,
    });
  } catch (err) {
    next(err);
  }
};

export const gradeAttempt = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { attemptId } = req.params;
    const adminId = req.user.id;

    const parsed = GradeAttemptSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
      relations: ["exam", "student", "answers", "answers.question"],
    });

    if (!attempt) throw new AppError("Attempt not found", 404);
    if (!attempt.isSubmitted) {
      throw new AppError("Cannot grade an unsubmitted attempt", 400);
    }

    const admin = await Admin.findOne({ where: { id: adminId } });
    if (!admin) throw new AppError("Admin not found", 404);

    const updatesByQuestionId = new Map(
      parsed.data.answers.map((a) => [a.questionId, a.marksObtained]),
    );

    let newScore = 0;

    for (const ans of attempt.answers) {
      const q = ans.question;
      const nextMarks = updatesByQuestionId.get(q.id);

      if (nextMarks !== undefined) {
        if (nextMarks > q.marks) {
          throw new AppError(
            `Marks for question ${q.id} cannot exceed question max marks (${q.marks})`,
            400,
          );
        }
        ans.marksObtained = nextMarks;
        await ans.save();
      }

      newScore += ans.marksObtained;
    }

    attempt.score = newScore;
    attempt.gradedBy = admin;
    attempt.gradedAt = new Date();
    await attempt.save();

    return res.json({
      message: "Attempt graded successfully",
      attempt: {
        id: attempt.id,
        score: attempt.score,
        gradedAt: attempt.gradedAt,
        gradedBy: {
          id: admin.id,
          fullName: admin.fullName,
        },
      },
    });
  } catch (err) {
    next(err);
  }
};

// =================== UPDATE STUDENT ===================
export const updateStudent = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { studentId } = req.params;

    const parsed = UpdateStudentSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const data = parsed.data;

    const student = await Student.findOne({ where: { id: studentId } });
    if (!student) throw new AppError("Student not found", 404);

    // Check email uniqueness
    if (data.email && data.email !== student.email) {
      const existing = await Student.findOne({ where: { email: data.email } });
      if (existing) throw new AppError("Email already in use", 409);
    }

    Object.assign(student, data);
    await student.save();

    res.json({
      message: "Student updated successfully",
      student: {
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        phoneNumber: student.phoneNumber,
        gender: student.gender,
        dob: student.dob,
        profileImage: student.profileImage,
        updatedAt: student.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

// =================== DELETE STUDENT (SOFT DELETE) ===================
export const deleteStudent = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { studentId } = req.params;

    const student = await Student.findOne({ where: { id: studentId } });
    if (!student) throw new AppError("Student not found", 404);

    if (!student.isActive) {
      throw new AppError("Student already deleted", 400);
    }

    student.isActive = false;
    await student.save();

    res.json({ message: "Student deleted successfully" });
  } catch (err) {
    next(err);
  }
};

// =================== RESET STUDENT PASSWORD ===================
export const resetStudentPassword = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { studentId } = req.params;

    const parsed = AdminResetPasswordSchema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);

    const { newPassword } = parsed.data;

    const student = await Student.findOne({ where: { id: studentId } });
    if (!student) throw new AppError("Student not found", 404);

    if (student.provider === "google") {
      throw new AppError(
        "Cannot reset password for Google-authenticated accounts",
        400,
      );
    }

    const hashedPassword = await hashPassword(newPassword);
    student.password = hashedPassword;
    await student.save();

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    next(err);
  }
};
