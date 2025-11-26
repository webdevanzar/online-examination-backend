import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
  ManyToOne,
  OneToMany,
} from "typeorm";
import { Admin } from "./Admin.entity";
import { Question } from "./Question.entity";

@Entity({ name: "exams" })
export class Exam extends BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // Basic Info
  @Column()
  title!: string;

  @Column({ type: "varchar", length: 500 })
  description!: string;

  @Column()
  subject!: string;

  @Column({ type: "text", nullable: true })
  instructions!: string;

  // Timing
  @Column({ type: "timestamp" })
  startTime!: Date;

  @Column({ type: "timestamp" })
  endTime!: Date;

  @Column({ type: "int" })
  duration!: number; // minutes

  // Exam Settings
  @Column({ type: "int" })
  totalMarks!: number;

  @Column({ type: "int" })
  passingMarks!: number;

  // Proctoring Settings
  @Column({ default: false })
  microphoneRequired    !: boolean;

  @Column({ default: true })
  faceDetectionRequired!: boolean;

  // Questions
  @Column({ type: "int", default: 0 })
  questionCount!: number;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ default: false })
  isPublished!: boolean;

  @ManyToOne(() => Admin, {cascade: true, onDelete: "CASCADE"})
  createdBy!: Admin;

  @OneToMany(() => Question, (question) => question.exam)
  questions!: Question[];

  // Audit
  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
