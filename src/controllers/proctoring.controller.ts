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

    // optional: validate attempt exists
    const attempt = await ExamAttempt.findOne({ where: { id: attemptId } });
    if (!attempt) throw new AppError("Attempt not found", 404);

    // forward to FastAPI
    const fastApiUrl =
      process.env.FASTAPI_URL || "http://127.0.0.1:8000/analyze-frame";
    const fastRes = await axios.post(
      fastApiUrl,
      { image: frame },
      { timeout: 5000 }
    );

    const { fraud, faces, objects, direction } = fastRes.data as any;

    // Save and emit cheat events (fraud expected as an array — adapt to your FastAPI response)
    // Your FastAPI returned `fraud` maybe as string or array — normalize it
    const detections = Array.isArray(fraud) ? fraud : fraud ? [fraud] : [];

    if (detections.length > 0) {
      await saveAndEmitCheatEvents(attemptId, frame, detections);
    }

    return res.json({ ok: true, detections, faces, objects, direction });
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

    attempt.isSubmitted = true;
    attempt.submittedAt = new Date();
    await attempt.save();

    // notify student's room
    const io = getIO();
    io.to(`attempt:${attemptId}`).emit("attempt:terminated", {
      attemptId,
      reason: req.body?.reason ?? "Terminated by admin",
      at: new Date(),
    });

    // notify admins as well
    io.to("admins").emit("attempt:terminated", {
      attemptId,
      reason: req.body?.reason,
    });

    return res.json({ ok: true, message: "Attempt terminated" });
  } catch (err) {
    next(err);
  }
};
