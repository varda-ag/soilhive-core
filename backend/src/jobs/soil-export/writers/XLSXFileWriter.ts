import * as XLSX from 'xlsx';
import { IFileWriter, ExportRecord } from '../types';
import { /*EXPORT_SCHEMA,*/ recordToOrderedObject } from '../types';

export class XLSXFileWriter implements IFileWriter {
  private workbook: XLSX.WorkBook | null = null;
  private worksheet: XLSX.WorkSheet | null = null;
  private filePath: string = '';
  private sheetName: string = '';
  private records: ExportRecord[] = [];

  async open(filePath: string, propertyAcronym: string): Promise<void> {
    this.filePath = filePath;
    this.sheetName = propertyAcronym;
    this.records = [];
    this.workbook = XLSX.utils.book_new();
  }

  async writeRecord(record: ExportRecord): Promise<void> {
    if (!this.workbook) {
      throw new Error('XLSXFileWriter: Writer not opened');
    }
    this.records.push(record);
  }

  async close(): Promise<void> {
    if (!this.workbook || this.records.length === 0) {
      return;
    }

    // Convert records to ordered objects using schema
    const data = this.records.map(recordToOrderedObject);

    this.worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(this.workbook, this.worksheet, this.sheetName);
    XLSX.writeFile(this.workbook, this.filePath);

    this.workbook = null;
    this.worksheet = null;
    this.records = [];
  }
}
