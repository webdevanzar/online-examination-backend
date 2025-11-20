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

  @OneToMany(() => Answer, (answer)=> answer.attempt, {cascade: true})
  answers!: Answer[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
