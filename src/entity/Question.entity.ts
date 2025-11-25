import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  BaseEntity,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Exam } from "./Exam.entity";
import { Option } from "./Option.entity";


export enum QuestionType {
  MCQ = "mcq",
  TYPING = "typing",
}

@Entity({ name: "questions" })
export class Question extends BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Exam, {
    onDelete: "CASCADE",
  })
  exam!: Exam;

  @Column({ type: "enum", enum: QuestionType })
  type!: QuestionType;

  @Column({ type: "text" })
  questionText!: string;

  // Marks per question
  @Column({ type: "float", default: 1 })
  marks!: number;

  @Column({ type: "boolean", default: false })
  hasMultipleCorrect!: boolean; // true = multiple answers possible

  // ---------- TYPING ONLY ----------
  @Column({ type: "int", nullable: true })
  answerMinLength!: number;

  @Column({ type: "int", nullable: true })
  answerMaxLength!: number;

  // ---------- ORDER ----------
  @Column({ type: "int", default: 0 })
  order!: number;

  @OneToMany(() => Option, (option) => option.question, { cascade: true })
  options!: Option[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
