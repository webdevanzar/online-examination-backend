import express from "express";
import {
  enrollFaceForExam,
  verifyFaceForEnrollment,
  getEnrollmentStatus,
  enrollKeystrokeForUser,
  verifyKeystrokeForUser,
  getTypingProfileStatus,
} from "../controllers/biometric.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/attempt/:attemptId/enroll-face", authMiddleware, enrollFaceForExam);
router.post("/attempt/:attemptId/verify-face", authMiddleware, verifyFaceForEnrollment);
router.get("/attempt/:attemptId/enrollment-status", authMiddleware, getEnrollmentStatus);

// User-centric keystroke routes (no attemptId required)
router.post("/user/enroll-keystroke", authMiddleware, enrollKeystrokeForUser);
router.post("/user/verify-keystroke", authMiddleware, verifyKeystrokeForUser);
router.get("/user/typing-profile-status", authMiddleware, getTypingProfileStatus);

export default router;
