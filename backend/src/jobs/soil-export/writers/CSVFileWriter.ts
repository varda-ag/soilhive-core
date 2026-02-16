// src/jobs/soil-export/writers/CSVFileWriter.ts

import { createObjectCsvWriter } from 'csv-writer';
import { IFileWriter, ExportRecord } from '../types';
import { EXPORT_SCHEMA } from '../types';

export class CSVFileWriter implements IFileWriter {
  private writer: any;
  private filePath: string = '';

  async open(filePath: string /*, propertyAcronym: string*/): Promise<void> {
    this.filePath = filePath;

    // Dynamically build header from schema
    const header = EXPORT_SCHEMA.map(field => ({
      id: field.key,
      title: field.title,
    }));

    this.writer = createObjectCsvWriter({
      path: filePath,
      header,
    });
  }

  async writeRecord(record: ExportRecord): Promise<void> {
    if (!this.writer) {
      throw new Error('CSVFileWriter: Writer not opened');
    }
    await this.writer.writeRecords([record]);
  }

  async close(): Promise<void> {
    this.writer = null;
  }
}
