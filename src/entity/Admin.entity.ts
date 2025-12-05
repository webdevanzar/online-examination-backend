import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  BaseEntity,
} from "typeorm";

@Entity({ name: "admins" })
export class Admin extends BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ length: 200 })
  fullName!: string;

  @Column({ unique: true, length: 200 })
  email!: string;

  @Column({ type: "text", nullable: true })
  password!: string | null;

  @Column({
    type: "enum",
    enum: ["local", "google"],
    default: "local",
  })
  provider!: "local" | "google";

  @Column({ nullable: true })
  profileImage!: string;

  @Column({ nullable: true })
  profileImagePublicId!: string;

  @Column({ default: true })
  isActive!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
