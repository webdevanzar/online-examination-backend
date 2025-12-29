import express from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  checkFrame,
  terminateAttempt,
  reportVoiceViolation,
} from "../controllers/proctoring.controller";

const router = express.Router();

// Analyze a camera frame for fraud signals during an attempt
// Body: { frame: string (data URL or base64) }
router.post("/attempt/:attemptId/check-frame", authMiddleware, checkFrame);

// Report voice violation detected by Voice ML Worker
// Body: { issues: string[], speech_probability: number, risk_score: number }
router.post(
  "/attempt/:attemptId/voice-violation",
  authMiddleware,
  reportVoiceViolation
);

// Terminate an attempt by admin action
// Body: { reason?: string }
router.post("/attempt/:attemptId/terminate", authMiddleware, terminateAttempt);

export default router;
