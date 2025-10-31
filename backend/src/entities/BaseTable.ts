import { BaseEntity, DeleteDateColumn, UpdateDateColumn, CreateDateColumn } from "typeorm";

abstract class BaseTable extends BaseEntity {
  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}

export default BaseTable;
