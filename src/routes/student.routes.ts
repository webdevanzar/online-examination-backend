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
} from "../controllers/student.controller";
import { mediaUpload } from "../config/multer";
import { authMiddleware } from "../middleware/auth.middleware";

const router = express.Router();

router.post("/login", studentLogin);
router.post("/logout", studentLogout);

router.get("/exams/:examId", authMiddleware, getExamQuestions);

router.post(
  "/register",
  mediaUpload.fields([
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  studentRegister
);

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
