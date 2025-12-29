import cors from "cors";
import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { Request, Response } from "express";
import http from "http";
import { AppDataSource } from "./data-source";
import adminRouter from "./routes/admin.routes";
import studentRouter from "./routes/student.routes";
import biometricRouter from "./routes/biometric.routes";
import proctoringRouter from "./routes/proctoring.routes";
import { initSocket } from "./socket";
import { errorHandler } from "./utils/ErrorHandler";
import cron from "node-cron";
import { Exam } from "./entity/Exam.entity";
dotenv.config();

const app = express();

const { PORT = 3000 } = process.env;
app.use(express.json({ limit: "8mb" })); // frames can be big
app.use(cookieParser());
// ... your other middlewares (auth, cookie parser, cors)
// Middleware
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:4000",
      "http://localhost:5174",
    ],
    credentials: true,
  })
);

// API endpoints
app.use("/api/admin", adminRouter);
app.use("/api/student", studentRouter);
app.use("/api/biometric", biometricRouter);
app.use("/api/proctoring", proctoringRouter);

app.get("/{*any}", (req: Request, res: Response) => {
  res.status(404).json({
    status: "fail",
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});
app.use(errorHandler);

AppDataSource.initialize()
  .then(async () => {
    const server = http.createServer(app);
    initSocket(server);

    server.listen(PORT, () => {
      console.log("Server is running on http://localhost:" + PORT);
    });
    console.log("Data Source has been initialized!");

    // Cron: every minute, deactivate exams whose endTime has passed
    cron.schedule("* * * * *", async () => {
      try {
        await Exam.createQueryBuilder()
          .update(Exam)
          .set({ isActive: false })
          .where("endTime < :now AND isActive = :active", { now: new Date(), active: true })
          .execute();
      } catch (err) {
        console.error("Cron job failed to deactivate expired exams:", err);
      }
    });
  })
  .catch((error) => console.log(error));
