import {
  BaseEntity,
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from "typeorm";
import { ExamAttempt } from "./ExamAttempt.entity";

@Entity("cheat_events")
export class CheatEvent extends BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => ExamAttempt, { onDelete: "CASCADE" })
  attempt!: ExamAttempt;

  @Column()
  eventType!: string; // e.g. "multiple_faces", "phone_detected"

  @Column({ type: "float", default: 0 })
  confidence!: number;

  @Column({ type: "text", nullable: true })
  screenshot!: string; // base64

  @CreateDateColumn()
  createdAt!: Date;
}
