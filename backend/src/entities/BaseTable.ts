import { BaseEntity, DeleteDateColumn, UpdateDateColumn, CreateDateColumn } from "typeorm";

abstract class BaseTable extends BaseEntity {
  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date | null;

  @DeleteDateColumn()
  deletedAt: Date | null;
}

export default BaseTable;
