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
} from "../controllers/admin.controller";
import { mediaUpload } from "../config/multer";
import { authMiddleware } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/login", adminLogin);
router.post("/logout", adminLogout);

router.post("/register", mediaUpload.single("image"), adminRegister);
router.post("/create-exam/:id", authMiddleware, createExam);
router.post("/update-exam/:id", authMiddleware, updateExam);
router.post("/delete-exam/:id", authMiddleware, deleteExam);

// Create question (examId from params)
router.post("/exam/:examId", authMiddleware, createQuestion);

// Update question (questionId from params)
router.put("/question/:questionId", authMiddleware, updateQuestion);

// Delete question
router.delete("/question/:questionId", authMiddleware, deleteQuestion);

export default router;
