import cors from "cors";
import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { Request, Response } from "express";
import { AppDataSource } from "./data-source";
import adminRouter from "./routes/admin.routes";
import studentRouter from "./routes/student.routes";
dotenv.config();

const app = express();

// Middleware
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:4000"],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
const { PORT = 3000 } = process.env;

app.use("/api/admin", adminRouter);
app.use("/api/student", studentRouter);


app.get("/{*any}", (req: Request, res: Response) => {
  res.status(404).json({
    status: "fail",
    message: `Cannot ${req.method} ${req.originalUrl}`,
  });
});

AppDataSource.initialize()
  .then(async () => {
    app.listen(PORT, () => {
      console.log("Server is running on http://localhost:" + PORT);
    });
    console.log("Data Source has been initialized!");
  })
  .catch((error) => console.log(error));
