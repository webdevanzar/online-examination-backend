import { Request, Response, NextFunction } from "express";
import axios from "axios";
import { CheatEvent } from "../entity/CheatEvent.entity";
import { ExamAttempt } from "../entity/ExamAttempt.entity";
import { getIO } from "../socket";
import { AppError } from "../utils/ErrorHandler";

// helper: save cheat events and emit to admins
async function saveAndEmitCheatEvents(
  attemptId: string,
  frameBase64: string,
  detections: any[]
) {
  // detections expected from FastAPI, adapt keys accordingly
  // e.g. detections = [{ type: "multiple_faces", confidence: 0.9, isMajor: true }, ...]
  for (const d of detections) {
    const evt = CheatEvent.create({
      attempt: { id: attemptId } as any,
      eventType: d.type ?? d.event ?? "unknown",
      confidence: d.confidence ?? d.score ?? 0,
      screenshot: frameBase64,
    });
    await evt.save();

    // emit to admins and the student's attempt room
    const payload = {
      id: evt.id,
      attemptId,
      eventType: evt.eventType,
      confidence: evt.confidence,
      createdAt: evt.createdAt,
      screenshot: evt.screenshot, // base64 string
      raw: d,
    };

    const io = getIO();
    io.to("admins").emit("cheat:event", payload);
    io.to(`attempt:${attemptId}`).emit("cheat:event", payload);
  }
}

export const checkFrame = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { attemptId } = req.params;
    const { frame } = req.body; // expected base64 PNG/JPEG dataurl e.g. "data:image/jpeg;base64,...."

    // Validate attempt exists
    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
      relations: ["student"],
    });
    if (!attempt) throw new AppError("Attempt not found", 404);

    // Check if already terminated
    if (attempt.isTerminated || attempt.isSubmitted) {
      return res.json({
        ok: false,
        terminated: true,
        message: "Exam already terminated or submitted",
      });
    }

    // Forward to FastAPI
    const fastApiUrl =
      process.env.FASTAPI_URL || "http://127.0.0.1:8000/analyze-frame";
    const fastRes = await axios.post(
      fastApiUrl,
      { image: frame },
      { timeout: 5000 }
    );

    const { fraud_severity, faces, objects, direction } = fastRes.data as any;

    const io = getIO();

    // Handle fraud severity
    if (fraud_severity) {
      // Handle minor frauds - warning system
      if (fraud_severity.minor && fraud_severity.minor.length > 0) {
        for (const issue of fraud_severity.minor) {
          await CheatEvent.create({
            attempt: { id: attemptId } as any,
            eventType: issue,
            confidence: 0.8,
            screenshot: frame,
            severity: "minor",
            causedWarning: true,
            causedTermination: false,
          }).save();
        }

        attempt.warningCount += 1;
        await attempt.save();

        // Emit warning to student
        io.to(`attempt:${attemptId}`).emit("cheat:warning", {
          type: "minor",
          message: fraud_severity.minor.join(", "),
          warningCount: attempt.warningCount,
          maxWarnings: attempt.maxWarnings,
        });

        // Emit to admins
        io.to("admins").emit("cheat:event", {
          attemptId,
          eventType: fraud_severity.minor.join(", "),
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

          return res.json({
            ok: false,
            terminated: true,
            reason: attempt.terminationReason,
          });
        }
      }

      // Handle major frauds - immediate termination
      if (fraud_severity.has_major && fraud_severity.major.length > 0) {
        for (const issue of fraud_severity.major) {
          await CheatEvent.create({
            attempt: { id: attemptId } as any,
            eventType: issue,
            confidence: 0.95,
            screenshot: frame,
            severity: "major",
            causedWarning: false,
            causedTermination: true,
          }).save();
        }

        attempt.isTerminated = true;
        attempt.isSubmitted = true;
        attempt.submittedAt = new Date();
        attempt.terminationReason = `Major fraud detected: ${fraud_severity.major.join(", ")}`;
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

        return res.json({
          ok: false,
          terminated: true,
          reason: attempt.terminationReason,
        });
      }
    }

    return res.json({
      ok: true,
      faces,
      objects,
      direction,
      warningCount: attempt.warningCount,
      maxWarnings: attempt.maxWarnings,
    });
  } catch (err) {
    next(err);
  }
};

// Admin terminate endpoint
export const terminateAttempt = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { attemptId } = req.params;

    const attempt = await ExamAttempt.findOne({ where: { id: attemptId } });
    if (!attempt) throw new AppError("Attempt not found", 404);

    const reason = req.body?.reason ?? "Terminated by admin";

    attempt.isTerminated = true;
    attempt.isSubmitted = true;
    attempt.submittedAt = new Date();
    attempt.terminationReason = reason;
    await attempt.save();

    // notify student's room
    const io = getIO();
    io.to(`attempt:${attemptId}`).emit("attempt:terminated", {
      attemptId,
      reason,
      at: new Date(),
    });

    // notify admins as well
    io.to("admins").emit("attempt:terminated", {
      attemptId,
      reason,
    });

    return res.json({ ok: true, message: "Attempt terminated" });
  } catch (err) {
    next(err);
  }
};
