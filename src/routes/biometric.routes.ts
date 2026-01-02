import express from "express";
import {
  enrollFaceForExam,
  verifyFaceForEnrollment,
  getEnrollmentStatus,
  enrollKeystrokeForUser,
  verifyKeystrokeForUser,
  getTypingProfileStatus,
  verifyWithVideo,
  verifyFaceForExam,
} from "../controllers/biometric.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/attempt/:attemptId/enroll-face", authMiddleware, enrollFaceForExam);
router.post("/attempt/:attemptId/verify-face", authMiddleware, verifyFaceForEnrollment);
router.post("/attempt/:attemptId/verify-with-video", authMiddleware, verifyWithVideo);
router.get("/attempt/:attemptId/enrollment-status", authMiddleware, getEnrollmentStatus);

// User-centric routes (no attemptId required)
router.post("/user/enroll-keystroke", authMiddleware, enrollKeystrokeForUser);
router.post("/user/verify-keystroke", authMiddleware, verifyKeystrokeForUser);
router.get("/user/typing-profile-status", authMiddleware, getTypingProfileStatus);

// NEW: Face verification before exam attempt creation
router.post("/user/verify-face-for-exam", authMiddleware, verifyFaceForExam);

export default router;
