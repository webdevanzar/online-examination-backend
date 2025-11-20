import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  BaseEntity,
  CreateDateColumn,
  Index,
} from "typeorm";
import { Notification } from "./Notification.entitty";
import { Student } from "./Student.entity";

@Entity("notification_profiles")
export class NotificationProfile extends BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ManyToOne(() => Notification, {
    onDelete: "CASCADE",
  })
  notification: Notification;

  @ManyToOne(() => Student, {
    onDelete: "CASCADE",
  })
  student: Student;

  @Column({ default: false })
  isRead: boolean;

  @Column({ type: "timestamp", nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
