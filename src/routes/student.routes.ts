import express from "express";
import {
  getExamQuestions,
  studentLogin,
  studentLogout,
  studentRegister,
  startExam,
  saveAnswer,
  autoSaveAnswers,
  getAttemptStatus,
  submitExam,
  checkFrame,
  getAttemptSummary,
  studentProfileImageUpdate,
  studentSelfieVideoUpdate,
  studentProfileUpdate,
  getMe,
  studentProfileImageDelete,
  studentSelfieVideoDelete,
  studentGoogleAuth,
  getPublishedExams,
} from "../controllers/student.controller";
import { authMiddleware } from "../middleware/auth.middleware";
import { mediaUpload } from "../config/multer";

const router = express.Router();

router.post("/login", studentLogin);
router.post("/logout", studentLogout);
router.post("/auth/google", studentGoogleAuth);

// current user profile
router.get("/me", authMiddleware, getMe);

// get published exams
router.get("/exams", authMiddleware, getPublishedExams);

router.get("/exams/:examId", authMiddleware, getExamQuestions);

router.post("/register", studentRegister);

//profile update
router.put("/profile", authMiddleware, studentProfileUpdate);

//profile image update
router.post(
  "/profile-image",
  authMiddleware,
  mediaUpload.single("profileImage"),
  studentProfileImageUpdate
);

//profile image delete
router.delete("/profile-image", authMiddleware, studentProfileImageDelete);

//selfie video update
router.post(
  "/selfie-video",
  authMiddleware,
  mediaUpload.single("selfieVideo"),
  studentSelfieVideoUpdate
);

//selfie video delete
router.delete("/selfie-video", authMiddleware, studentSelfieVideoDelete);

//exam start
router.post("/exams/:id/start", authMiddleware, startExam);

//save answer
router.post(
  "/exams/:examId/attempt/:attemptId/answer",
  authMiddleware,
  saveAnswer
);

//autosave
router.post(
  "/exams/:examId/attempt/:attemptId/autosave",
  authMiddleware,
  autoSaveAnswers
);

//submit exam
router.post(
  "/exams/:examId/attempt/:attemptId/submit",
  authMiddleware,
  submitExam
);

//status
router.get("/attempt/:attemptId/status", authMiddleware, getAttemptStatus);

//check frame
router.post("/attempt/:attemptId/check-frame", authMiddleware, checkFrame);

//get attempt summary
router.get("/attempt/:attemptId/summary", authMiddleware, getAttemptSummary);

export default router;
