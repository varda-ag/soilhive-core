import { BaseEntity, DeleteDateColumn, UpdateDateColumn, CreateDateColumn } from "typeorm";

abstract class BaseTable extends BaseEntity {
  @CreateDateColumn({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date | null;

  @DeleteDateColumn()
  deleted_at: Date | null;
}

export default BaseTable;
