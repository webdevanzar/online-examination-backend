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
} from "../controllers/admin.controller";
import { mediaUpload } from "../config/multer";
import { authMiddleware } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/login", adminLogin);
router.post("/logout", adminLogout);

router.post("/register", mediaUpload.single("profileImage"), adminRegister);
router.post("/create-exam/:id", authMiddleware, createExam);
router.post("/update-exam/:id", authMiddleware, updateExam);
router.post("/delete-exam/:id", authMiddleware, deleteExam);

router.get("/exams/:examId", authMiddleware, getExamQuestions);

// Create question (examId from params)
router.post("/exam/:examId", authMiddleware, createQuestion);



// Update question (questionId from params)
router.put("/question/:questionId", authMiddleware, updateQuestion);

// Delete question
router.delete("/question/:questionId", authMiddleware, deleteQuestion);

//terminate attempt
router.post("/attempt/:attemptId/terminate", authMiddleware, terminateAttempt);

//manually log cheat event
router.post("/attempt/:attemptId/cheat-event", authMiddleware, logCheatEvent);

export default router;
