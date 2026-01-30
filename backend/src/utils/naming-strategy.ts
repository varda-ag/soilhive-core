import { DefaultNamingStrategy, Table } from 'typeorm';

export class DatabaseNamingStrategy extends DefaultNamingStrategy {
  override primaryKeyName(tableOrName: Table | string, columnNames: string[]): string {
    return `PK_${this.getTableName(tableOrName)}_${this.joinColumns(columnNames)}`;
  }

  private joinColumns(columnNames: string[]): string {
    return columnNames.join('_');
  }

  override uniqueConstraintName(tableOrName: Table | string, columnNames: string[]): string {
    return `UQ_${this.getTableName(tableOrName)}_${this.joinColumns(columnNames)}`;
  }

  override foreignKeyName(
    referencingTableOrName: Table | string,
    referencingColumnNames: string[],
    referencedTablePath?: string,
    referencedColumnNames?: string[],
  ): string {
    const referencingTableName = this.getTableName(referencingTableOrName);

    const referencingReferencedGroup = referencingColumnNames.map((referencingColumn, index) => {
      return `${referencingTableName}_${referencingColumn}_${referencedTablePath}_${referencedColumnNames?.[index]}`;
    });

    return `FK_${referencingReferencedGroup.join('_')}`;
  }

  override indexName(tableOrName: Table | string, columnNames: string[], where?: string): string {
    let indexName = `IDX_${this.getTableName(tableOrName)}_${this.joinColumns(columnNames)}`;

    if (where) {
      const suffix = this.getPartialIndexNameSuffix(tableOrName, columnNames, where);
      indexName = `${indexName}_${suffix}`;
    }

    return indexName;
  }
  private getPartialIndexNameSuffix(tableOrName: Table | string, columnNames: string[], where: string): string {
    const whereClauseMap: Record<string, string> = {
      '"deleted_at" IS NULL': `deleted_at_IS_NULL`,
    };

    if (whereClauseMap[where]) {
      return `WHERE_${whereClauseMap[where]}`;
    }

    const generatedIndexName = super.indexName(tableOrName, columnNames, where);
    const { 1: hash } = generatedIndexName.split('IDX_');

    return `WHERE_${hash}`;
  }
}
