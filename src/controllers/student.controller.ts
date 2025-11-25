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
import { Question } from "../entity/Question.entity";
import { Answer } from "../entity/Answer.entity";
import { ExamAttempt } from "../entity/ExamAttempt.entity";
import { Exam } from "../entity/Exam.entity";
import { Option } from "../entity/Option.entity";
import { CheatEvent } from "../entity/CheatEvent.entity";
import axios from "axios";

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

export const getExamQuestions = async (
  req: Request,
  res: Response,
  next: NextFunction
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
  next: NextFunction
) => {
  try {
    const { examId } = req.params;
    const studentId = req.user.id; // logged-in student

    const exam = await Exam.findOne({
      where: { id: examId },
    });

    if (!exam) throw new AppError("Exam not found", 404);

    const now = new Date();

    if (now > new Date(exam.endTime)) {
      throw new AppError("Exam is already ended", 403);
    }

    // Has student already attempted this exam?
    let attempt = await ExamAttempt.findOne({
      where: {
        student: { id: studentId },
        exam: { id: examId },
      },
      relations: ["answers"],
    });

    // If attempt exists and submitted → cannot restart
    if (attempt && attempt.isSubmitted) {
      throw new AppError("You have already finished this exam", 403);
    }

    // If attempt exists but not submitted → resume
    if (attempt && !attempt.isSubmitted) {
      return res.json({
        message: "Exam resumed",
        attemptId: attempt.id,
        startedAt: attempt.startedAt,
      });
    }

    // Otherwise create a new attempt
    attempt = ExamAttempt.create({
      student: { id: studentId } as any,
      exam: { id: examId } as any,
      startedAt: new Date(),
      isSubmitted: false,
      score: 0,
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
        selectedOption: null,
        writtenAnswer: null,
        marksObtained: 0,
      })
    );

    await Answer.save(answerEntities);

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
  next: NextFunction
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
        "answers.selectedOption",
      ],
    });

    if (!attempt) throw new AppError("Attempt not found", 404);
    if (attempt.isSubmitted) throw new AppError("Exam already submitted", 403);

    // find answer row
    const answer = attempt.answers.find((a) => a.question.id === questionId);
    if (!answer) throw new AppError("Answer row not found", 404);

    // update based on question type
    if (selectedOptionId) {
      const opt = await Option.findOne({ where: { id: selectedOptionId } });
      answer.selectedOption = opt;
      answer.writtenAnswer = null;
    }

    if (writtenAnswer !== undefined) {
      answer.writtenAnswer = writtenAnswer;
      answer.selectedOption = null;
    }

    await answer.save();

    return res.json({ message: "Answer saved successfully" });
  } catch (err) {
    next(err);
  }
};

export const autoSaveAnswers = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { attemptId } = req.params;
    const { answers } = req.body;

    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
      relations: ["answers", "answers.question"],
    });

    if (!attempt) throw new AppError("Attempt not found", 404);
    if (attempt.isSubmitted) throw new AppError("Exam already submitted", 403);

    for (let ans of answers) {
      const saveRow = attempt.answers.find(
        (a) => a.question.id === ans.questionId
      );
      if (!saveRow) continue;

      if (ans.selectedOptionId) {
        const opt = await Option.findOne({
          where: { id: ans.selectedOptionId },
        });
        saveRow.selectedOption = opt;
        saveRow.writtenAnswer = null;
      }

      if (ans.writtenAnswer !== undefined) {
        saveRow.writtenAnswer = ans.writtenAnswer;
        saveRow.selectedOption = null;
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
  next: NextFunction
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

//submit exam
export const submitExam = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { attemptId } = req.params;

    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
      relations: ["answers", "answers.question", "answers.selectedOption"],
    });

    if (!attempt) throw new AppError("Attempt not found", 404);
    if (attempt.isSubmitted) throw new AppError("Already submitted", 400);

    let totalScore = 0;

    for (let ans of attempt.answers) {
      const q = ans.question;

      if (q.type === "mcq") {
        if (ans.selectedOption?.isCorrect) {
          ans.marksObtained = q.marks;
          totalScore += q.marks;
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

    return res.json({
      message: "Exam submitted successfully",
      score: totalScore,
    });
  } catch (err) {
    next(err);
  }
};


//frame check endpoint
export const checkFrame = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { attemptId } = req.params;
    const { frame } = req.body;

    const fastApiRes = await axios.post("http://127.0.0.1:8000/analyze-frame", {
      image: frame,
    });

    const fraud = fastApiRes.data.fraud;

    // Save events
    for (let f of fraud) {
      const evt = CheatEvent.create({
        attempt: { id: attemptId } as any,
        eventType: f.type,
        confidence: f.confidence,
        screenshot: frame,
      });
      await evt.save();
    }

    // Auto terminate on severe fraud
    if (fraud.some((f) => f.isMajor)) {
      const attempt = await ExamAttempt.findOne({ where: { id: attemptId } });
      attempt.isSubmitted = true;
      attempt.submittedAt = new Date();
      await attempt.save();
    }

    return res.json(fastApiRes.data);
  } catch (err) {
    next(err);
  }
};

//get attempt summary
export const getAttemptSummary = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const attempt = await ExamAttempt.findOne({
      where: { id: req.params.attemptId },
      relations: ["answers", "answers.question", "answers.selectedOption"],
    });

    if (!attempt) throw new AppError("Attempt not found", 404);

    return res.json(attempt);
  } catch (err) {
    next(err);
  }
};
