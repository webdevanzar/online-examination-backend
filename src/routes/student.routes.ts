import express from "express";
import {
  studentLogin,
  studentLogout,
  studentRegister,
} from "../controllers/student.controller";
import { mediaUpload } from "../config/multer";

const router = express.Router();

router.post("/login", studentLogin);
router.post("/logout", studentLogout);

router.post(
  "/register",
  mediaUpload.fields([
    { name: "image", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  studentRegister
);

export default router;
