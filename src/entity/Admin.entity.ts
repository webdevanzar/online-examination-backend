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

  @Column('text')
  password!: string;

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
