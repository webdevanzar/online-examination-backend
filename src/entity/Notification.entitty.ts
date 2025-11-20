import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  BaseEntity,
  Index,
} from "typeorm";

export enum NotificationType {
  EXAM_SCHEDULED = "EXAM_SCHEDULED",
  EXAM_UPDATED = "EXAM_UPDATED",
  EXAM_DELETED = "EXAM_DELETED",
  EXAM_RESULT = "EXAM_RESULT",
}

@Entity("notifications")
export class Notification extends BaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Index()
  @Column({ type: "enum", enum: NotificationType })
  type!: NotificationType;

  @Column({ type: "text", nullable: true })
  message!: string;

  @Index()
  @Column({ type: "uuid", nullable: true })
  targetId!: string;

  @Index()
  @CreateDateColumn()
  createdAt!: Date;

  // Inverse relationship: lets us access all NotificationProfile entries (recipients) for this notification.
  // This is a virtual field and does not create a column in the database.
  //   @OneToMany(() => NotificationProfile, (np) => np.notification)
  //   recipients!: NotificationProfile[];
}
