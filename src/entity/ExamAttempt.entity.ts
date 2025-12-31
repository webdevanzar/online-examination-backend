import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  Column,
  BaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

import { Student } from "./Student.entity";
import { Exam } from "./Exam.entity";
import { Answer } from "./Answer.entity";

@Entity({ name: "exam_attempts" })
export class ExamAttempt extends BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Student, { onDelete: "CASCADE" })
  student!: Student;

  @ManyToOne(() => Exam, { onDelete: "CASCADE" })
  exam!: Exam;

  @Column({ type: "timestamp", nullable: true })
  startedAt!: Date;

  @Column({ type: "timestamp", nullable: true })
  submittedAt!: Date;

  @Column({ type: "float", default: 0 })
  score!: number;

  @Column({ default: false })
  isSubmitted!: boolean;

  @Column({ type: "int", default: 0 })
  warningCount!: number;

  @Column({ type: "int", default: 3 })
  maxWarnings!: number;

  @Column({ default: false })
  isTerminated!: boolean;

  @Column({ type: "text", nullable: true })
  terminationReason!: string;

  @Column({ default: false })
  isFaceEnrolled!: boolean;

  @Column({ default: false })
  isFaceVerified!: boolean;

  @Column({ default: false })
  isKeystrokeEnrolled!: boolean;

  @OneToMany(() => Answer, (answer)=> answer.attempt, {cascade: true})
  answers!: Answer[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
