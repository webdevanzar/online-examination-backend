import express from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { checkFrame, terminateAttempt } from "../controllers/proctoring.controller";

const router = express.Router();

// Analyze a camera frame for fraud signals during an attempt
// Body: { frame: string (data URL or base64) }
router.post("/attempt/:attemptId/check-frame", authMiddleware, checkFrame);

// Terminate an attempt by admin action
// Body: { reason?: string }
router.post("/attempt/:attemptId/terminate", authMiddleware, terminateAttempt);

export default router;
