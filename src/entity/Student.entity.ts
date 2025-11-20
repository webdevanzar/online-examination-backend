import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
} from "typeorm";

export enum Gender {
  MALE = "male",
  FEMALE = "female",
  OTHER = "other",
}

@Entity({ name: "students" })
export class Student extends BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ length: 255 })
  fullName!: string;

  @Column({ length: 255, unique: true })
  email!: string;

  @Column({ nullable: true })
  phoneNumber!: string;

  @Column("text")
  password!: string;

  @Column({ nullable: true })
  profileImage!: string;

  @Column({ nullable: true })
  profileImagePublicId!: string;

  @Column({ type: "date", nullable: true })
  dob!: Date;

  @Column({
    type: "enum",
    enum: Gender,
  })
  gender!: Gender;

  @Column({ nullable: true })
  selfieVideo!: string;

  @Column({ nullable: true })
  selfieVideoPublicId!: string;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
