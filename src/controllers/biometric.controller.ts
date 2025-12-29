import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { Student } from "../entity/Student.entity";
import { ExamAttempt } from "../entity/ExamAttempt.entity";
import { CheatEvent } from "../entity/CheatEvent.entity";
import { AppError } from "../utils/ErrorHandler";
import { getIO } from "../socket";

const FACE_ML_URL = process.env.FACE_ML_URL || "http://127.0.0.1:8001";
const KEYSTROKE_ML_URL = process.env.KEYSTROKE_ML_URL || "http://127.0.0.1:8000";

export const enrollFaceForExam = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { attemptId } = req.params;
    const userId = (req as any).user.id;

    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
      relations: ["student"],
    });

    if (!attempt) throw new AppError("Attempt not found", 404);
    if (attempt.student.id !== userId) throw new AppError("Unauthorized", 403);

    const student = await Student.findOne({ where: { id: userId } });
    if (!student || !student.selfieVideo) {
      throw new AppError("Selfie video not found. Please complete registration.", 400);
    }

    // Call ML worker to enroll
    const enrollResponse = await axios.post(
      `${FACE_ML_URL}/enroll-face`,
      { user_id: userId, video_url: student.selfieVideo },
      { timeout: 30000 }
    );

    if (!enrollResponse.data.success) {
      throw new AppError(
        "Face enrollment failed: " + enrollResponse.data.message,
        400
      );
    }

    attempt.isFaceEnrolled = true;
    await attempt.save();

    return res.json({
      success: true,
      message: enrollResponse.data.message,
    });
  } catch (err) {
    next(err);
  }
};

// User-centric keystroke enrollment (no attempt required)
export const enrollKeystrokeForUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { keystrokes } = req.body as { keystrokes: unknown[] };
    const userId = (req as any).user.id as string;

    if (!keystrokes || !Array.isArray(keystrokes) || keystrokes.length < 50) {
      throw new AppError("Insufficient keystroke data. Please type more.", 400);
    }

    const enrollResponse = await axios.post(
      `${KEYSTROKE_ML_URL}/enroll`,
      { user_id: userId, keystrokes },
      { timeout: 15000 }
    );

    if (!enrollResponse.data?.success) {
      throw new AppError(
        enrollResponse.data?.message || "Keystroke enrollment failed",
        400
      );
    }

    return res.json({
      success: true,
      message: enrollResponse.data.message || "Keystroke pattern enrolled successfully",
    });
  } catch (err) {
    next(err);
  }
};

// User-centric keystroke verification (with optional attempt tracking)
export const verifyKeystrokeForUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { keystrokes, attemptId } = req.body as {
      keystrokes: unknown[];
      attemptId?: string;
    };
    const userId = (req as any).user.id as string;

    if (!keystrokes || !Array.isArray(keystrokes) || keystrokes.length < 20) {
      return res.json({
        verified: false,
        confidence: 0,
        message: "Insufficient keystroke data for verification",
      });
    }

    const verifyResponse = await axios.post(
      `${KEYSTROKE_ML_URL}/verify`,
      { user_id: userId, keystrokes },
      { timeout: 8000 }
    );

    const { authenticated, confidence } = verifyResponse.data;

    // If attemptId provided and verification failed, log CheatEvent
    if (attemptId && !authenticated) {
      const attempt = await ExamAttempt.findOne({
        where: { id: attemptId },
      });

      if (attempt && !attempt.isTerminated && !attempt.isSubmitted) {
        // Create CheatEvent for keystroke mismatch
        await CheatEvent.create({
          attempt: { id: attemptId } as any,
          eventType: "Keystroke pattern mismatch",
          confidence: 1 - confidence,
          screenshot: null,
          severity: "minor",
          causedWarning: true,
          causedTermination: false,
        }).save();

        // Increment warning count
        attempt.warningCount += 1;
        await attempt.save();

        const io = getIO();

        // Emit warning to student
        io.to(`attempt:${attemptId}`).emit("cheat:warning", {
          type: "keystroke",
          message: "Keystroke pattern mismatch detected",
          warningCount: attempt.warningCount,
          maxWarnings: attempt.maxWarnings,
        });

        // Emit to admins
        io.to("admins").emit("cheat:event", {
          attemptId,
          eventType: "Keystroke pattern mismatch",
          severity: "minor",
          warningCount: attempt.warningCount,
          maxWarnings: attempt.maxWarnings,
        });

        // Check if max warnings reached
        if (attempt.warningCount >= attempt.maxWarnings) {
          attempt.isTerminated = true;
          attempt.isSubmitted = true;
          attempt.submittedAt = new Date();
          attempt.terminationReason = `Exceeded maximum warnings (${attempt.maxWarnings})`;
          await attempt.save();

          io.to(`attempt:${attemptId}`).emit("attempt:terminated", {
            attemptId,
            reason: attempt.terminationReason,
            at: new Date(),
          });

          io.to("admins").emit("attempt:terminated", {
            attemptId,
            reason: attempt.terminationReason,
          });
        }
      }
    }

    return res.json({
      verified: authenticated,
      confidence,
      message: authenticated
        ? "Keystroke pattern verified"
        : "Keystroke pattern mismatch detected",
    });
  } catch (err) {
    next(err);
  }
};

export const verifyFaceForEnrollment = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { attemptId } = req.params;
    const { frame } = req.body;
    const userId = (req as any).user.id;

    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
      relations: ["student"],
    });

    if (!attempt) throw new AppError("Attempt not found", 404);
    if (attempt.student.id !== userId) throw new AppError("Unauthorized", 403);

    if (!attempt.isFaceEnrolled) {
      throw new AppError("Face not enrolled. Please enroll first.", 400);
    }

    const verifyResponse = await axios.post(
      `${FACE_ML_URL}/verify-face`,
      { user_id: userId, image: frame },
      { timeout: 5000 }
    );

    const { verified, confidence, message } = verifyResponse.data;

    return res.json({
      verified,
      confidence,
      message,
    });
  } catch (err) {
    next(err);
  }
};


export const getEnrollmentStatus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { attemptId } = req.params;
    const userId = (req as any).user.id;

    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
      relations: ["student"],
    });

    if (!attempt) throw new AppError("Attempt not found", 404);
    if (attempt.student.id !== userId) throw new AppError("Unauthorized", 403);

    return res.json({
      faceEnrolled: attempt.isFaceEnrolled,
      keystrokeEnrolled: attempt.isKeystrokeEnrolled,
      canStartExam: attempt.isFaceEnrolled && attempt.isKeystrokeEnrolled,
    });
  } catch (err) {
    next(err);
  }
};
