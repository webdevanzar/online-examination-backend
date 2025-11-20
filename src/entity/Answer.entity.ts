import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  BaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

import { ExamAttempt } from "./ExamAttempt.entity";
import { Question } from "./Question.entity";
import { Option } from "./Option.entity";

@Entity({ name: "answers" })
export class Answer extends BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => ExamAttempt, (attempt) => attempt.answers, {
    onDelete: "CASCADE",
  })
  attempt!: ExamAttempt;

  @ManyToOne(() => Question, { onDelete: "CASCADE" })
  question!: Question;

  // ----- For MCQ -----
  @ManyToOne(() => Option, { nullable: true })
  selectedOption!: Option;

  // ----- For Writing -----
  @Column({ type: "text", nullable: true })
  writtenAnswer!: string;

  @Column({ type: "float", default: 0 })
  marksObtained!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
