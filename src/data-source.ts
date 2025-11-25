import "reflect-metadata";
import { DataSource } from "typeorm";
import dotenv from "dotenv";
import { Exam } from "./entity/Exam.entity";
import { Question } from "./entity/Question.entity";
import { Option } from "./entity/Option.entity";
import { ExamAttempt } from "./entity/ExamAttempt.entity";
import { CheatEvent } from "./entity/CheatEvent.entity";
import { Student } from "./entity/Student.entity";
import { Admin } from "./entity/Admin.entity";
import { Answer } from "./entity/Answer.entity";
import { NotificationProfile } from "./entity/NotificationProfile.entity";
import { Notification } from "./entity/Notification.entitty";

dotenv.config();

const { DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_DATABASE, NODE_ENV } =
  process.env;

export const AppDataSource = new DataSource({
  type: "postgres",
  host: DB_HOST,
  port: parseInt(DB_PORT || "5432"),
  username: DB_USERNAME,
  password: DB_PASSWORD,
  database: DB_DATABASE,
  synchronize: true, // auto create tables in dev
  // logging: NODE_ENV === "dev" /*Eable logging to see the SQL queries*/,
  entities: [
    Exam,
    Question,
    Option,
    ExamAttempt,
    CheatEvent,
    Student,
    Admin,
    Answer,
    NotificationProfile,
    Notification,
  ],
  migrations: ["src/migrations/*.ts"],
  subscribers: [],
});
