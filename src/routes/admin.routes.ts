import express from "express";
import {
  adminLogin,
  adminLogout,
  adminRegister,
  createExam,
  updateExam,
  deleteExam,
  createQuestion,
  updateQuestion,
  deleteQuestion,
  getExamQuestions,
  terminateAttempt,
  logCheatEvent,
  deleteAdminProfileImage,
  adminProfileUpdate,
  addAdminProfileImage,
  getAllStudents,
  getStudentById,
  getAllExams,
  getExamById,
  getExamAttempts,
} from "../controllers/admin.controller";
import { mediaUpload } from "../config/multer";
import { authMiddleware } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/login", adminLogin);
router.post("/logout", adminLogout);
router.delete("/profile-image", authMiddleware, deleteAdminProfileImage);
router.post("/register", mediaUpload.single("profileImage"), adminRegister);
router.put(
  "/profile",
  authMiddleware,
  mediaUpload.single("profileImage"),
  adminProfileUpdate
);
router.put(
  "/profile-image",
  authMiddleware,
  mediaUpload.single("profileImage"),
  addAdminProfileImage
);

// Student routes
router.get("/students", authMiddleware, getAllStudents);
router.get("/students/:studentId", authMiddleware, getStudentById);

// Exam routes
router.get("/exams", authMiddleware, getAllExams);
router.post("/exams", authMiddleware, createExam);
router.get("/exams/:examId", authMiddleware, getExamById);
router.get("/exams/:examId/questions", authMiddleware, getExamQuestions);
router.get("/exams/:examId/attempts", authMiddleware, getExamAttempts);
router.put("/exams/:examId", authMiddleware, updateExam);
router.delete("/exams/:examId", authMiddleware, deleteExam);

// Question routes
router.post("/exams/:examId/questions", authMiddleware, createQuestion);
router.put("/questions/:questionId", authMiddleware, updateQuestion);
router.delete("/questions/:questionId", authMiddleware, deleteQuestion);

// Attempt management routes
router.post("/attempts/:attemptId/terminate", authMiddleware, terminateAttempt);
router.post("/attempts/:attemptId/cheat-events", authMiddleware, logCheatEvent);

export default router;
