import "reflect-metadata";
import { DataSource } from "typeorm";
import dotenv from "dotenv";

import { User } from "./entity/auth/User.entity";
import { Auth } from "./entity/auth/Auth.entity";
import { Lead } from "./entity/leads/Lead.entity";
import { LeadHistory } from "./entity/leads/LeadHistory.entity";
import { Attendance } from "./entity/attendance/Attendance.entity";
import { Holiday } from "./entity/attendance/Holidays.entity";
import { Leave } from "./entity/attendance/Leave.entity";
import { Notification } from "./entity/notification/Notification.entity";
import { NotificationProfile } from "./entity/notification/NotificationProfile.entity";
import { Token } from "./entity/common/Token.entity";
import { Client } from "./entity/projectmanagement/client.entity";
import { ProjectTeam } from "./entity/projectmanagement/projectTeam.entity";
import { Project } from "./entity/projectmanagement/project.entity";
import { Task } from "./entity/projectmanagement/task.entity";
import { TaskComment } from "./entity/projectmanagement/taskComment.entity";
import { TaskTimeLog } from "./entity/projectmanagement/taskTimeLog.entity";
import { Attachment } from "./entity/projectmanagement/attachment.entity";
import { TaskHistory } from "./entity/projectmanagement/taskHistory.entity";

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
    Auth,
    User,
    Lead,
    LeadHistory,
    Token,
    Attendance,
    Holiday,
    Leave,
    Notification,
    NotificationProfile,
    Client,
    Project,
    ProjectTeam,
    Task,
    TaskComment,
    TaskHistory,
    TaskTimeLog,
    Attachment,
  ],
  migrations: ["src/migrations/*.ts"],
  subscribers: [],
});
