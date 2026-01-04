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

    console.log(`[FACE-HTTP] Received frame check request for attempt ${attemptId}`);

    // Validate attempt exists
    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
      relations: ["student"],
    });
    if (!attempt) {
      console.log(`[FACE-HTTP] Attempt ${attemptId} not found`);
      throw new AppError("Attempt not found", 404);
    }

    // Check if already terminated
    if (attempt.isTerminated || attempt.isSubmitted) {
      console.log(`[FACE-HTTP] Attempt ${attemptId} invalid or ended (terminated: ${attempt.isTerminated}, submitted: ${attempt.isSubmitted})`);
      return res.json({
        ok: false,
        terminated: true,
        message: "Exam already terminated or submitted",
      });
    }

    // Forward to FastAPI (Face ML Worker)
    // Accept either:
    // - FACE_ML_URL=http://127.0.0.1:8001
    // - FACE_ML_URL=http://127.0.0.1:8001/analyze-frame
    // and normalize to the final analyze endpoint.
    const rawFaceMlUrl =
      process.env.FACE_ML_URL || "http://127.0.0.1:8001/analyze-frame";
    const fastApiUrl = rawFaceMlUrl.includes("/analyze-frame")
      ? rawFaceMlUrl
      : `${rawFaceMlUrl.replace(/\/+$/, "")}/analyze-frame`;

    console.log(`[FACE-HTTP] Forwarding to ML Worker at ${fastApiUrl}`);

    const fastRes = await axios.post(
      fastApiUrl,
      { image: frame },
      { timeout: 5000 }
    ).catch((error) => {
      console.error(`[FACE-HTTP] ML Worker error:`, error.message);
      throw new AppError("Face ML Worker unavailable", 503);
    });

    const { fraud_severity, faces, objects, direction } = fastRes.data as any;

    console.log(`[FACE] ML Worker response for ${attemptId}:`, {
      fraud_severity,
      faces: faces?.length,
      objects: objects?.length,
      direction
    });

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

        console.log(`[FACE] Emitting cheat:warning to room attempt:${attemptId}`, {
          warningCount: attempt.warningCount,
          message: fraud_severity.minor.join(", ")
        });

        // Emit warning to student
        io.to(`attempt:${attemptId}`).emit("cheat:warning", {
          type: "minor",
          message: fraud_severity.minor.join(", "),
          warningCount: attempt.warningCount,
          maxWarnings: attempt.maxWarnings,
        });

        console.log(`[FACE] Socket event emitted successfully`);

        // Emit to admins
        io.to("admins").emit("cheat:event", {
          attemptId,
          eventType: fraud_severity.minor.join(", "),
          severity: "minor",
          warningCount: attempt.warningCount,
          maxWarnings: attempt.maxWarnings,
        });

        // REMOVED: Auto-termination on max warnings
        // Warnings are now only for display - exam only terminates on major fraud or manual end
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

        // NOTE: For testing, do NOT auto-terminate on major fraud. Emit warning only.
        io.to(`attempt:${attemptId}`).emit("cheat:warning", {
          type: "major",
          message: `Major fraud detected: ${fraud_severity.major.join(", ")}`,
          warningCount: attempt.warningCount,
          maxWarnings: attempt.maxWarnings,
        });

        io.to("admins").emit("cheat:event", {
          attemptId,
          eventType: fraud_severity.major.join(", "),
          severity: "major",
          warningCount: attempt.warningCount,
          maxWarnings: attempt.maxWarnings,
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

    // Stop voice monitoring
    try {
      await axios.post(
        `${process.env.VOICE_ML_URL || 'http://127.0.0.1:8002'}/voice/stop-monitoring`,
        { attemptId },
        { timeout: 3000 }
      );
    } catch (err) {
      console.error("[VOICE] Failed to stop monitoring:", err);
    }

    return res.json({ ok: true, message: "Attempt terminated" });
  } catch (err) {
    next(err);
  }
};

// Voice violation reporting endpoint
export const reportVoiceViolation = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { attemptId } = req.params;
    const { issues, speech_probability, risk_score } = req.body;

    // Validate attempt exists
    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
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

    // Determine severity based on issues and risk score
    const isMajor =
      risk_score > 0.7 ||
      issues.some(
        (issue: string) =>
          issue.includes("sustained_speech") || issue.includes("normal_speech")
      );

    const severity = isMajor ? "major" : "minor";
    const eventType = issues.join(", ");

    // Create CheatEvent
    await CheatEvent.create({
      attempt: { id: attemptId } as any,
      eventType: `Voice: ${eventType}`,
      confidence: speech_probability,
      screenshot: null,
      severity: severity,
      causedWarning: !isMajor,
      causedTermination: false,
    }).save();

    const io = getIO();

    // NOTE: For testing, do NOT auto-terminate on major voice fraud. Emit warning only.
    if (isMajor) {
      io.to(`attempt:${attemptId}`).emit("cheat:warning", {
        type: "voice",
        message: `Major voice fraud detected: ${eventType}`,
        warningCount: attempt.warningCount,
        maxWarnings: attempt.maxWarnings,
      });

      io.to("admins").emit("cheat:event", {
        attemptId,
        eventType: `Voice: ${eventType}`,
        severity: "major",
        warningCount: attempt.warningCount,
        maxWarnings: attempt.maxWarnings,
      });

      return res.json({
        ok: true,
        warningCount: attempt.warningCount,
        maxWarnings: attempt.maxWarnings,
      });
    }

    // Handle minor fraud - warning
    attempt.warningCount += 1;
    await attempt.save();

    // Emit warning to student
    io.to(`attempt:${attemptId}`).emit("cheat:warning", {
      type: "voice",
      message: `Voice detected: ${eventType}`,
      warningCount: attempt.warningCount,
      maxWarnings: attempt.maxWarnings,
    });

    // Emit to admins
    io.to("admins").emit("cheat:event", {
      attemptId,
      eventType: `Voice: ${eventType}`,
      severity: "minor",
      warningCount: attempt.warningCount,
      maxWarnings: attempt.maxWarnings,
    });

    // REMOVED: Auto-termination on max warnings
    // Warnings are now only for display - exam only terminates on major fraud or manual end

    return res.json({
      ok: true,
      warningCount: attempt.warningCount,
      maxWarnings: attempt.maxWarnings,
    });
  } catch (err) {
    next(err);
  }
};

export const receiveVoiceDetection = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { attemptId, speech_probability, issues, risk_score } = req.body;

    console.log(`[VOICE-HTTP] Received detection for attempt ${attemptId}:`, {
      speech_probability,
      issues,
      risk_score
    });

    // Validate attempt exists
    const attempt = await ExamAttempt.findOne({
      where: { id: attemptId },
    });

    if (!attempt || attempt.isTerminated || attempt.isSubmitted) {
      console.log(`[VOICE-HTTP] Attempt ${attemptId} invalid or ended`);
      return res.json({ ok: false, message: "Invalid or ended attempt" });
    }

    // Determine severity
    const isMajor = risk_score > 0.7 || issues.some((issue: string) =>
      issue.includes("sustained_speech") || issue.includes("normal_speech")
    );

    const severity = isMajor ? "major" : "minor";
    const eventType = issues.join(", ");

    // Create CheatEvent
    await CheatEvent.create({
      attempt: { id: attemptId } as any,
      eventType: `Voice: ${eventType}`,
      confidence: speech_probability,
      screenshot: null,
      severity: severity,
      causedWarning: !isMajor,
      causedTermination: false,
    }).save();

    const io = getIO();

    // NOTE: For testing, do NOT auto-terminate on major voice fraud. Emit warning only.
    if (isMajor) {
      console.log(`[VOICE-HTTP] Major fraud detected for attempt ${attemptId} (no auto-terminate in testing)`);

      io.to(`attempt:${attemptId}`).emit("cheat:warning", {
        type: "voice",
        message: `Major voice fraud detected: ${eventType}`,
        warningCount: attempt.warningCount,
        maxWarnings: attempt.maxWarnings,
      });

      io.to("admins").emit("cheat:event", {
        attemptId,
        eventType: `Voice: ${eventType}`,
        severity: "major",
        warningCount: attempt.warningCount,
        maxWarnings: attempt.maxWarnings,
      });

      return res.json({ ok: true });
    }

    // Handle minor fraud - warning
    attempt.warningCount += 1;
    await attempt.save();

    console.log(`[VOICE-HTTP] Emitting warning for attempt ${attemptId}, count: ${attempt.warningCount}`);

    // Emit warning to student
    io.to(`attempt:${attemptId}`).emit("cheat:warning", {
      type: "voice",
      message: `Voice detected: ${eventType}`,
      warningCount: attempt.warningCount,
      maxWarnings: attempt.maxWarnings,
    });

    // Emit to admins
    io.to("admins").emit("cheat:event", {
      attemptId,
      eventType: `Voice: ${eventType}`,
      severity: "minor",
      warningCount: attempt.warningCount,
      maxWarnings: attempt.maxWarnings,
    });

    // REMOVED: Auto-termination on max warnings
    // Warnings are now only for display - exam only terminates on major fraud or manual end

    return res.json({ ok: true, warningCount: attempt.warningCount });
  } catch (err) {
    console.error("[VOICE-HTTP] Error:", err);
    next(err);
  }
};
