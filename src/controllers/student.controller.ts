import { Request, Response, NextFunction } from "express";
import { In } from "typeorm";
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
import { handleDelete, handleUpload } from "../config/cloudinary";
import { hashPassword } from "../utils/hashPassword";
import { Question } from "../entity/Question.entity";
import { Answer } from "../entity/Answer.entity";
import { ExamAttempt } from "../entity/ExamAttempt.entity";
import { Exam } from "../entity/Exam.entity";
import { Option } from "../entity/Option.entity";
import { CheatEvent } from "../entity/CheatEvent.entity";
import axios from "axios";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

export const studentLogin = async (
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
    const student = await Student.findOne({
      where: { email },
    });

    if (!student) {
      throw new AppError("Invalid credentials", 400);
    }

    if (!student.isActive) {
      throw new AppError("Your account is inactive. Please contact admin.", 403);
    }

    if (student.provider === "google") {
      throw new AppError(
        "This email is registered with google. Please use google login.",
        409,
      );
    }

    // Compare password
    const isValid = await bcrypt.compare(password, student.password);
    if (!isValid) {
      throw new AppError("Invalid credentials", 400);
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

export const studentGoogleAuth = async (
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

    //  Find admin by email
    let student = await Student.findOne({ where: { email } });


    // Existing LOCAL account → block Google login
    if (student && student.provider === "local") {
      throw new AppError(
        "This email is registered with password. Please use normal login.",
        409,
      );
    }

    //  Create account if not exists (Google signup)
    if (!student) {
      student = Student.create({
        email,
        fullName,
        profileImage: picture,
        provider: "google",
        password: null,
      });

      await student.save();
    }



    // Generate tokens
    const tokenPayload = {
      id: student.id,
      fullName: student.fullName,
      email: student.email,
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
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        profileImage: student.profileImage,
        createdAt: student.createdAt,
        updatedAt: student.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const getMe = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = req.user.id;
    const student = await Student.findOne({ where: { id } });
    if (!student) throw new AppError("Student not found", 404);

    // Auto-backfill: Check if typing profile exists in ML but flag is false
    if (!student.hasTypingProfile) {
      try {
        const KEYSTROKE_ML_URL =
          process.env.KEYSTROKE_ML_URL || "http://127.0.0.1:8000";
        const mlResponse = await axios.get(
          `${KEYSTROKE_ML_URL}/check-model/${id}`,
          { timeout: 180000 },
        );

        if (mlResponse.data?.exists) {
          student.hasTypingProfile = true;
          await student.save();
        }
      } catch (err) {
        // Silently fail - user will set up profile manually if needed
        console.log("Backfill check failed:", err);
      }
    }

    return res.json({
      user: {
        id: student.id,
        fullName: student.fullName,
        email: student.email,
        phoneNumber: student.phoneNumber,
        profileImage: student.profileImage,
        dob: student.dob,
        gender: student.gender,
        selfieVideo: student.selfieVideo,
        hasTypingProfile: student.hasTypingProfile,
        createdAt: student.createdAt,
        updatedAt: student.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};

export const studentLogout = (
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

    // Clear cookies (must match cookie attributes used when setting)
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: true,
      sameSite: "none",
    });

    return res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};

export const studentRegister = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const parsedResult = RegisterSchema.safeParse(req.body);
    if (!parsedResult.success) {
      return next(parsedResult.error);
    }
    const { email, password, fullName, phoneNumber, gender, dob } =
      parsedResult.data as RegisterSchemaType;

    // Check if email already exists
    const isExisting = await Student.findOneBy({ email });
    if (isExisting) {
      throw new AppError("Email already in use", 409);
    }

    //hash password
    const hashedPassword = await hashPassword(password);

    const authData = Student.create({
      email,
      fullName,
      phoneNumber,
      gender,
      dob,
      password: hashedPassword,
    });
    await authData.save();
    res.status(201).json({ message: "Student registered successfully" });
  } catch (error) {
    next(error);
  }
};

export const studentProfileUpdate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = req.user.id;
    const { fullName, phoneNumber, gender, dob } = req.body;

    const student = await Student.findOne({ where: { id } });

    if (!student) throw new AppError("Student not found", 404);

    student.fullName = fullName;
    student.phoneNumber = phoneNumber;
    student.gender = gender;
    student.dob = dob;

    await student.save();

    res.status(200).json({
      message: "Student profile updated successfully",
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
      },
    });
  } catch (error) {
    next(error);
  }
};

export const studentProfileImageUpdate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = req.user.id;

    const student = await Student.findOne({ where: { id } });
    if (!student) {
      throw new AppError("Student not found", 404);
    }

    const file = req.file;
    if (!file) {
      throw new AppError("Profile image is required", 400);
    }

    if (!file.mimetype.startsWith("image/")) {
      throw new AppError("Only image files are allowed", 400);
    }

    // ✅ delete old image if exists
    if (student.profileImagePublicId) {
      await handleDelete(student.profileImagePublicId);
    }

    const result = await handleUpload(file.buffer, "image");

    if (!result?.secure_url || !result?.public_id) {
      throw new AppError("Image upload failed", 400);
    }

    student.profileImage = result.secure_url;
    student.profileImagePublicId = result.public_id;

    await student.save();

    res.status(200).json({
      message: "Student profile image updated successfully",
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
      },
    });
  } catch (error) {
    next(error);
  }
};

export const studentProfileImageDelete = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const student = await Student.findOneBy({ id: req.user.id });
    if (!student) {
      throw new AppError("Student not found", 404);
    }

    if (student.profileImagePublicId) {
      try {
        await handleDelete(student.profileImagePublicId);
      } catch (error) {
        throw new AppError("Failed to delete previous image", 400);
      }
    }

    student.profileImage = null;
    student.profileImagePublicId = null;

    await student.save();

    res.status(200).json({
      message: "Student profile image deleted successfully",
      user: student,
    });
  } catch (error) {
    next(error);
  }
};

export const studentSelfieVideoUpdate = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const id = req.user.id;

    const student = await Student.findOne({ where: { id } });
    if (!student) {
      throw new AppError("Student not found", 404);
    }

    const file = req.file;
    if (!file) {
      throw new AppError("Selfie video is required", 400);
    }

    if (!file.mimetype.startsWith("video/")) {
      throw new AppError("Only video files are allowed", 400);
    }

    // ✅ delete old video if exists
    if (student.selfieVideoPublicId) {
      await handleDelete(student.selfieVideoPublicId);
    }

    const result = await handleUpload(file.buffer, "video");

    if (!result?.secure_url || !result?.public_id) {
      throw new AppError("Video upload failed", 400);
    }

    student.selfieVideo = result.secure_url;
    student.selfieVideoPublicId = result.public_id;

    await student.save();

    res.status(200).json({
      message: "Student selfie video updated successfully",
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
      },
    });
  } catch (error) {
    next(error);
  }
};

export const studentSelfieVideoDelete = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const student = await Student.findOneBy({ id: req.user.id });
    if (!student) {
      throw new AppError("Student not found", 404);
    }

    if (student.selfieVideoPublicId) {
      try {
        await handleDelete(student.selfieVideoPublicId);
      } catch (error) {
        throw new AppError("Failed to delete previous image", 400);
      }
    }

    student.selfieVideo = null;
    student.selfieVideoPublicId = null;

    await student.save();

    res.status(200).json({
      message: "Student selfie video deleted successfully",
      user: student,
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
    const { examId } = req.params;

    const questions = await Question.find({
      where: { exam: { id: examId } },
      relations: ["options"],
    });

    return res.json({ questions });
  } catch (err) {
    next(err);
  }
};

//exam start
export const startExam = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { id: examId } = req.params;
    const studentId = req.user.id; // logged-in student

    const student = await Student.findOne({ where: { id: studentId } });
    if (!student) {
      throw new AppError(
        "Student not found. Please login again (or your account may have been deleted).",
        404,
      );
    }

    const exam = await Exam.findOne({
      where: { id: examId },
    });

    if (!exam) throw new AppError("Exam not found", 404);

    const now = new Date();

    if (now > new Date(exam.endTime)) {
      throw new AppError("Exam is already ended", 403);
    }

    // Check for existing attempt
    let attempt = await ExamAttempt.findOne({
      where: {
        student: { id: studentId },
        exam: { id: examId },
      },
      relations: ["answers"],
      order: { createdAt: "DESC" }, // Get most recent attempt
    });

    // Block if exam was normally submitted (not terminated)
    if (attempt && attempt.isSubmitted && !attempt.isTerminated) {
      throw new AppError(
        "You have already completed this exam. Multiple attempts are not allowed.",
        403,
      );
    }

    // Block if exam is still active (not submitted, not terminated)
    if (attempt && !attempt.isSubmitted && !attempt.isTerminated) {
      throw new AppError(
        "You have an active exam session. Please continue or submit it first.",
        403,
      );
    }

    // If attempt was terminated OR no attempt exists → ALLOW (create new attempt below)

    // Create new attempt (allowed after termination or first time)
    attempt = ExamAttempt.create({
      student,
      exam: { id: examId } as any,
      startedAt: new Date(),
      isSubmitted: false,
      isTerminated: false,
      terminationReason: null,
      score: 0,
      isFaceEnrolled: false,
      isFaceVerified: false,
      warningCount: 0,
    });

    await attempt.save();

    // OPTIONAL: Pre-load Answer rows (one per question)
    const questions = await Question.find({
      where: { exam: { id: examId } },
      relations: ["options"],
    });

    const answerEntities = questions.map((q) =>
      Answer.create({
        attempt: attempt,
        question: q,
        selectedOptions: [],
        writtenAnswer: null,
        marksObtained: 0,
      }),
    );

    await Answer.save(answerEntities);

    // Notify ML Worker to start voice monitoring
    try {
      await axios.post(
        `${process.env.VOICE_ML_URL || "http://127.0.0.1:8002"}/voice/start-monitoring`,
        { attemptId: attempt.id },
        { timeout: 180000 },
      );
      console.log(`[VOICE] Started monitoring for attempt: ${attempt.id}`);
    } catch (err) {
      console.error("[VOICE] Failed to start monitoring:", err);
    }

    res.status(201).json({
      message: "Exam started successfully",
      attemptId: attempt.id,
      startedAt: attempt.startedAt,
    });
  } catch (err) {
    next(err);
  }
};

//save answer
export const saveAnswer = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { attemptId } = req.params;
    const { questionId, selectedOptionId, writtenAnswer } = req.body;

    // load attempt
    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
      relations: [
        "exam",
        "answers",
        "answers.question",
        "answers.selectedOptions",
      ],
    });

    if (!attempt) throw new AppError("Attempt not found", 404);
    if (attempt.isSubmitted) throw new AppError("Exam already submitted", 403);

    // find answer row
    const answer = attempt.answers.find((a) => a.question.id === questionId);
    if (!answer) throw new AppError("Answer row not found", 404);

    // update based on question type
    if (
      selectedOptionId ||
      (req.body.selectedOptionIds && req.body.selectedOptionIds.length > 0)
    ) {
      const rawIds: string[] = req.body.selectedOptionIds || [selectedOptionId];
      const UUID_REGEX =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const ids = rawIds.filter((id) => UUID_REGEX.test(id));
      if (ids.length === 0) {
        return res
          .status(400)
          .json({ message: "Invalid option ID(s) provided" });
      }
      const opts = await Option.find({ where: { id: In(ids) } });
      answer.selectedOptions = opts;
      answer.writtenAnswer = null;
    }

    if (writtenAnswer !== undefined) {
      answer.writtenAnswer = writtenAnswer;
      answer.selectedOptions = [];
    }

    await answer.save();

    return res.json({ message: "Answer saved successfully" });
  } catch (err) {
    next(err);
  }
};

/**
 * NEW: Get exam attempt status for a specific exam
 * Used to check if student has already attempted/submitted an exam
 */
export const getExamAttemptStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { examId } = req.params;
    const studentId = (req as any).user.id;

    // Find most recent attempt for this student and exam
    const attempt = await ExamAttempt.findOne({
      where: {
        student: { id: studentId },
        exam: { id: examId },
      },
      order: { createdAt: "DESC" },
      relations: ["exam"],
    });

    // No attempt exists
    if (!attempt) {
      return res.json({
        status: "not_attempted",
        canStart: true,
      });
    }

    // Submitted (not terminated) - cannot restart
    if (attempt.isSubmitted && !attempt.isTerminated) {
      return res.json({
        status: "submitted",
        canStart: false,
        score: attempt.score,
        submittedAt: attempt.submittedAt,
        totalMarks: attempt.exam.totalMarks,
      });
    }

    // Terminated - can restart
    if (attempt.isTerminated) {
      return res.json({
        status: "terminated",
        canStart: true,
        terminationReason: attempt.terminationReason,
        warningCount: attempt.warningCount,
      });
    }

    // Active/in-progress attempt
    if (!attempt.isSubmitted && !attempt.isTerminated) {
      return res.json({
        status: "in_progress",
        canStart: false,
        attemptId: attempt.id,
        startedAt: attempt.startedAt,
        message: "Resume existing attempt",
      });
    }

    return res.json({ status: "unknown", canStart: false });
  } catch (err) {
    next(err);
  }
};

export const autoSaveAnswers = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { attemptId } = req.params;
    const { answers } = req.body;

    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
      relations: ["answers", "answers.question", "answers.selectedOptions"],
    });

    if (!attempt) throw new AppError("Attempt not found", 404);
    if (attempt.isSubmitted) throw new AppError("Exam already submitted", 403);

    for (let ans of answers) {
      const saveRow = attempt.answers.find(
        (a) => a.question.id === ans.questionId,
      );
      if (!saveRow) continue;

      if (
        ans.selectedOptionId ||
        (ans.selectedOptionIds && ans.selectedOptionIds.length > 0)
      ) {
        const rawIds: string[] = ans.selectedOptionIds || [
          ans.selectedOptionId,
        ];
        const UUID_REGEX =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const ids = rawIds.filter((id) => UUID_REGEX.test(id));
        if (ids.length > 0) {
          const opts = await Option.find({
            where: { id: In(ids) },
          });
          saveRow.selectedOptions = opts;
          saveRow.writtenAnswer = null;
        }
      } else if (ans.writtenAnswer) {
        // Only set writtenAnswer (and clear options) when there IS an actual text answer
        saveRow.writtenAnswer = ans.writtenAnswer;
        saveRow.selectedOptions = [];
      }

      await saveRow.save();
    }

    return res.json({ message: "Auto-save complete" });
  } catch (err) {
    next(err);
  }
};

//attempt status
export const getAttemptStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const attempt = await ExamAttempt.findOne({
      where: { id: req.params.attemptId },
    });

    if (!attempt) throw new AppError("Attempt not found", 404);

    return res.json({
      isSubmitted: attempt.isSubmitted,
      status: attempt.isSubmitted ? "submitted" : "active",
    });
  } catch (err) {
    next(err);
  }
};

// Get exam details by attempt ID
export const getExamDetailsByAttempt = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { attemptId } = req.params;
    const studentId = req.user.id;

    // Find attempt with exam and questions
    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
      relations: ["exam", "student"],
    });

    if (!attempt) {
      throw new AppError("Attempt not found", 404);
    }

    // Verify student owns this attempt
    if (attempt.student.id !== studentId) {
      throw new AppError("Unauthorized access to this exam attempt", 403);
    }

    // Check if already submitted
    if (attempt.isSubmitted) {
      throw new AppError("This exam has already been submitted", 403);
    }

    const exam = attempt.exam;

    // Fetch questions with options
    const questions = await Question.find({
      where: { exam: { id: exam.id } },
      relations: ["options"],
      order: { createdAt: "ASC" },
    });

    // Transform questions to match frontend format
    const formattedQuestions = questions.map((q) => ({
      id: q.id,
      question: q.questionText,
      type: q.type.toUpperCase(), // "MCQ" or "TYPING"
      hasMultipleCorrect: q.hasMultipleCorrect,
      options: q.options?.map((opt) => ({
        id: opt.id,
        text: opt.optionText,
      })),
      answerMinLength: q.answerMinLength,
      answerMaxLength: q.answerMaxLength,
    }));

    return res.json({
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        duration: exam.duration, // in minutes
        totalMarks: exam.totalMarks,
        startTime: exam.startTime,
        endTime: exam.endTime,
        questions: formattedQuestions,
      },
      attempt: {
        id: attempt.id,
        startedAt: attempt.startedAt,
        warningCount: attempt.warningCount,
        maxWarnings: attempt.maxWarnings,
      },
    });
  } catch (err) {
    next(err);
  }
};

//submit exam
export const submitExam = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { attemptId } = req.params;

    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
      relations: [
        "answers",
        "answers.question",
        "answers.selectedOptions",
        "answers.question.options",
      ],
    });

    if (!attempt) throw new AppError("Attempt not found", 404);
    if (attempt.isSubmitted) throw new AppError("Already submitted", 400);

    let totalScore = 0;

    for (let ans of attempt.answers) {
      const q = ans.question;

      if (q.type === "mcq") {
        const correctOptions = q.options.filter((o) => o.isCorrect);
        const selectedOptions = ans.selectedOptions;

        if (q.hasMultipleCorrect) {
          // Both must have same count and all IDs must match
          const correctIds = correctOptions.map((o) => o.id).sort();
          const selectedIds = selectedOptions.map((o) => o.id).sort();

          const isCorrect =
            correctIds.length === selectedIds.length &&
            correctIds.every((id, idx) => id === selectedIds[idx]);

          if (isCorrect) {
            ans.marksObtained = q.marks;
            totalScore += q.marks;
          }
        } else {
          // Standard single choice
          if (selectedOptions.length === 1 && selectedOptions[0].isCorrect) {
            ans.marksObtained = q.marks;
            totalScore += q.marks;
          }
        }
      }

      if (q.type === "typing") {
        // manual evaluation later
        ans.marksObtained = 0;
      }

      await ans.save();
    }

    attempt.score = totalScore;
    attempt.isSubmitted = true;
    attempt.submittedAt = new Date();
    await attempt.save();

    // Notify ML Worker to stop voice monitoring
    try {
      await axios.post(
        `${process.env.VOICE_ML_URL || "http://127.0.0.1:8002"}/voice/stop-monitoring`,
        { attemptId },
        { timeout: 180000 },
      );
      console.log(`[VOICE] Stopped monitoring for attempt: ${attemptId}`);
    } catch (err) {
      console.error("[VOICE] Failed to stop monitoring:", err);
    }

    return res.json({
      message: "Exam submitted successfully",
      score: totalScore,
    });
  } catch (err) {
    next(err);
  }
};

//frame check endpoint
// export const checkFrame = async (
//   req: Request,
//   res: Response,
//   next: NextFunction
// ) => {
//   try {
//     const { attemptId } = req.params;
//     const { frame } = req.body;

//     const fastApiRes = await axios.post("http://127.0.0.1:8000/analyze-frame", {
//       image: frame,
//     });

//     const fraud = fastApiRes.data.fraud;

//     // Save events
//     for (let f of fraud) {
//       const evt = CheatEvent.create({
//         attempt: { id: attemptId } as any,
//         eventType: f.type,
//         confidence: f.confidence,
//         screenshot: frame,
//       });
//       await evt.save();
//     }

//     // Auto terminate on severe fraud
//     if (fraud.some((f) => f.isMajor)) {
//       const attempt = await ExamAttempt.findOne({ where: { id: attemptId } });
//       attempt.isSubmitted = true;
//       attempt.submittedAt = new Date();
//       await attempt.save();
//     }

//     return res.json(fastApiRes.data);
//   } catch (err) {
//     next(err);
//   }
// };

//get attempt summary
export const getAttemptSummary = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const studentId = req.user.id;

    const attempt = await ExamAttempt.findOne({
      where: { id: req.params.attemptId },
      relations: [
        "student",
        "exam",
        "answers",
        "answers.question",
        "answers.question.options",
        "answers.selectedOptions",
      ],
    });

    if (!attempt) throw new AppError("Attempt not found", 404);

    if (attempt.student?.id !== studentId) {
      throw new AppError("Unauthorized access to this attempt", 403);
    }

    return res.json(attempt);
  } catch (err) {
    next(err);
  }
};

//get published exams
export const getPublishedExams = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const now = new Date();

    // Get published exams that are active and within time window
    const exams = await Exam.find({
      where: {
        isPublished: true,
      },
      select: [
        "id",
        "title",
        "description",
        "subject",
        "startTime",
        "endTime",
        "duration",
        "totalMarks",
        "passingMarks",
        "questionCount",
        "microphoneRequired",
        "faceDetectionRequired",
      ],
      order: {
        startTime: "ASC",
      },
    });

    return res.json({ exams });
  } catch (err) {
    next(err);
  }
};

// Get exam history for the logged-in student
export const getExamHistory = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const studentId = req.user.id;

    // Get all submitted attempts for this student
    const attempts = await ExamAttempt.find({
      where: {
        student: { id: studentId },
        isSubmitted: true,
      },
      relations: ["exam", "answers", "answers.question"],
      order: {
        submittedAt: "DESC",
      },
    });

    // Calculate statistics
    const totalExams = attempts.length;
    const passedExams = attempts.filter((attempt) => {
      const passingMarks = attempt.exam.passingMarks;
      return attempt.score >= passingMarks;
    }).length;

    const avgScore =
      totalExams > 0
        ? Math.round(
            attempts.reduce((sum, attempt) => {
              const percentage =
                (attempt.score / attempt.exam.totalMarks) * 100;
              return sum + percentage;
            }, 0) / totalExams,
          )
        : 0;

    // Format history items
    const history = attempts.map((attempt) => {
      const exam = attempt.exam;
      const scorePercentage = Math.round(
        (attempt.score / exam.totalMarks) * 100,
      );
      const isPassed = attempt.score >= exam.passingMarks;

      // Calculate correct answers (for MCQ only)
      const totalQuestions = attempt.answers.length;
      const correctAnswers = attempt.answers.filter(
        (ans) => ans.marksObtained > 0,
      ).length;

      return {
        id: attempt.id,
        examId: exam.id,
        title: exam.title,
        subject: exam.subject,
        status: isPassed ? "Passed" : "Failed",
        date: attempt.submittedAt,
        startedAt: attempt.startedAt,
        duration: exam.duration,
        score: scorePercentage,
        marksObtained: attempt.score,
        totalMarks: exam.totalMarks,
        passingMarks: exam.passingMarks,
        correct: correctAnswers,
        total: totalQuestions,
        isTerminated: attempt.isTerminated,
        terminationReason: attempt.terminationReason,
        warningCount: attempt.warningCount,
      };
    });

    return res.json({
      summary: {
        totalExams,
        passed: passedExams,
        failed: totalExams - passedExams,
        avgScore,
      },
      history,
    });
  } catch (err) {
    next(err);
  }
};
