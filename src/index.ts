import cors from "cors";
import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { Request, Response } from "express";
import { AppDataSource } from "./data-source";
import adminRouter from "./routes/admin.routes";
import studentRouter from "./routes/student.routes";
import * as proctoringController from "./controllers/proctoring.controller";
import { errorHandler } from "./utils/ErrorHandler";
dotenv.config();

const app = express();

const { PORT = 3000 } = process.env;
app.use(express.json({ limit: "8mb" })); // frames can be big
app.use(cookieParser());
// ... your other middlewares (auth, cookie parser, cors)
// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:4000"],
    credentials: true,
  })
);

// Proctoring endpoints
app.post("/attempt/:attemptId/check-frame", proctoringController.checkFrame);
app.post(
  "/attempt/:attemptId/terminate",
  proctoringController.terminateAttempt
);

// API endpoints
app.use("/api/admin", adminRouter);
app.use("/api/student", studentRouter);

app.get("/{*any}", (req: Request, res: Response) => {
  res.status(404).json({
    status: "fail",
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});
app.use(errorHandler);

AppDataSource.initialize()
  .then(async () => {
    app.listen(PORT, () => {
      console.log("Server is running on http://localhost:" + PORT);
    });
    console.log("Data Source has been initialized!");
  })
  .catch((error) => console.log(error));
