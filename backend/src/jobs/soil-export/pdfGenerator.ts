import PDFDocument from 'pdfkit';
import * as fs from 'fs';

const COLOR = {
  teal: '#2D7A6B',
  dark: '#1A1A1A',
  gray: '#888888',
  rule: '#CCCCCC',
};

const FONT = {
  bold: 'Helvetica-Bold',
  regular: 'Helvetica',
};

const PAGE_WIDTH = 595.28; // A4 pt
const MARGIN = 60;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const FIELD_DESCRIPTIONS: Record<string, string> = {
  geom: 'Geometry of the sampling location in the WGS84 coordinate system',
  dataset_name: 'Name of the source dataset',
  license: 'Terms of use associated with the dataset',
  sampling_date: 'Date of sample collection (ISO format: YYYY-MM-DD)',
  min_depth: 'Minimum sampling depth (cm)',
  max_depth: 'Maximum sampling depth (cm)',
  value: 'Reported value for the soil property',
  unit: 'Harmonized unit of measurement',
  sample_pretreatment: 'Physical or chemical preparation applied prior to analysis',
  technique: 'High-level category describing how the value was obtained',
  laboratory_method: 'Named laboratory protocol or analytical method',
  extractant_concentration: 'Concentration of the extraction solution used',
  extraction_ratio: 'Soil-to-solution ratio used during extraction',
  extraction_base: 'Basis of the extraction ratio (mass/mass, volume/mass, or volume/volume)',
  measurement_procedure: 'Instrument, technique, or procedure used',
  limit_of_detection: 'Lowest detectable concentration or analyte amount',
};

export interface DatasetPdfInfo {
  slug: string;
  name: string;
  url: string | undefined;
}

export interface GeneratePdfParams {
  outputPath: string;
  datasets: DatasetPdfInfo[];
  logoBuffer: Buffer | null;
  fileFormat: string;
  exportDate: Date;
  homepageUrl: string | undefined;
  termsUrl: string | undefined;
}

interface TocEntry {
  title: string;
  indent: boolean;
  indexLabel?: string;
  page: number;
}

// ─── Public helpers (exported for unit testing) ─────────────────────────────

export function drawHeader(doc: PDFKit.PDFDocument, logoBuffer: Buffer | null): void {
  const y = MARGIN - 30;
  doc.font(FONT.regular).fontSize(9).fillColor(COLOR.dark).text('Data download summary', MARGIN, y, { lineBreak: false });

  if (logoBuffer) {
    doc.image(logoBuffer, PAGE_WIDTH - MARGIN - 60, y - 8, { height: 28 });
  }

  doc
    .moveTo(MARGIN, y + 16)
    .lineTo(PAGE_WIDTH - MARGIN, y + 16)
    .strokeColor(COLOR.rule)
    .lineWidth(0.5)
    .stroke();
}

export function drawFooter(doc: PDFKit.PDFDocument, pageNumber: number, homepageUrl?: string): void {
  const PAGE_HEIGHT = 841.89; // A4 pt
  const y = PAGE_HEIGHT - MARGIN + 10;
  const copyrightText = `© ${new Date().getFullYear()} SoilHive is a Varda Foundation service. `;

  // y is past page maxY — using `width` here would trigger LineWrapper's overflow check
  // and auto-add pages.  Use lineBreak:false without width to bypass LineWrapper entirely.
  // URL is rendered as teal text only (no link annotation) to avoid the NaN that pdfkit
  // produces when `link` is combined with lineBreak:false and no width (textWidth unset).
  doc.font(FONT.regular).fontSize(8);
  const copyrightWidth = doc.widthOfString(copyrightText);
  const pageStr = String(pageNumber);
  const pageNumWidth = doc.widthOfString(pageStr);

  doc.fillColor(COLOR.gray).text(copyrightText, MARGIN, y, { lineBreak: false });
  if (homepageUrl) {
    doc.fillColor(COLOR.teal).text(homepageUrl, MARGIN + copyrightWidth, y, { lineBreak: false });
  }
  doc.fillColor(COLOR.gray).text(pageStr, PAGE_WIDTH - MARGIN - pageNumWidth, y, { lineBreak: false });
}

// ─── Private section renderers ───────────────────────────────────────────────

function sectionHeading(doc: PDFKit.PDFDocument, title: string, y?: number): number {
  const startY = y ?? doc.y;
  doc.font(FONT.regular).fontSize(18).fillColor(COLOR.teal).text(title, MARGIN, startY);
  const ruleY = doc.y + 2;
  doc
    .moveTo(MARGIN, ruleY)
    .lineTo(PAGE_WIDTH - MARGIN, ruleY)
    .strokeColor(COLOR.rule)
    .lineWidth(0.5)
    .stroke();
  doc.moveDown(0.6);
  return doc.y;
}

function subHeading(doc: PDFKit.PDFDocument, title: string): void {
  doc.moveDown(0.5).font(FONT.regular).fontSize(12).fillColor(COLOR.teal).text(title, MARGIN);
  doc.moveDown(0.3);
}

function bodyText(doc: PDFKit.PDFDocument, text: string): void {
  doc.font(FONT.regular).fontSize(10).fillColor(COLOR.dark).text(text, MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.5);
}

function bullet(doc: PDFKit.PDFDocument, label: string, value?: string): void {
  const bx = MARGIN + 10;
  doc.font(FONT.regular).fontSize(10).fillColor(COLOR.dark);
  if (value !== undefined) {
    doc.text('• ', bx, doc.y, { continued: true, lineBreak: false });
    doc.font(FONT.bold).text(`${label}: `, { continued: true, lineBreak: false });
    doc.font(FONT.regular).text(value, { width: CONTENT_WIDTH - 20 });
  } else {
    doc.text(`• ${label}`, bx, doc.y, { width: CONTENT_WIDTH - 20 });
  }
}

function drawCoverTitle(doc: PDFKit.PDFDocument, logoBuffer: Buffer | null): void {
  if (logoBuffer) {
    doc.image(logoBuffer, PAGE_WIDTH - MARGIN - 90, MARGIN, { height: 45 });
  }
  doc.font(FONT.bold).fontSize(36).fillColor(COLOR.dark).text('Data download', MARGIN, MARGIN);
  doc.font(FONT.regular).fontSize(24).fillColor(COLOR.dark).text('summary', MARGIN);
  doc.moveDown(3);
}

function drawToc(doc: PDFKit.PDFDocument, entries: TocEntry[], startY: number): void {
  doc.switchToPage(0);
  doc.y = startY;

  for (const entry of entries) {
    const x = entry.indent ? MARGIN + 20 : MARGIN;
    const bulletStr = entry.indent ? '' : '● ';
    const label = `${bulletStr}${entry.indexLabel ? entry.indexLabel + '. ' : ''}${entry.title}`;
    const pageStr = String(entry.page);

    // Measure text widths
    doc
      .font(FONT.regular)
      .fontSize(10)
      .fillColor(entry.indent ? COLOR.dark : COLOR.dark);
    const labelWidth = doc.widthOfString(label);
    const pageWidth = doc.widthOfString(pageStr);
    const dotsAreaStart = x + labelWidth + 4;
    const dotsAreaEnd = PAGE_WIDTH - MARGIN - pageWidth - 4;

    // Bullet + label
    if (!entry.indent) {
      doc.fillColor(COLOR.teal).text('● ', x, doc.y, { continued: true, lineBreak: false });
      doc.fillColor(COLOR.dark).text(`${entry.indexLabel ? entry.indexLabel + '. ' : ''}${entry.title}`, {
        continued: false,
        lineBreak: false,
      });
    } else {
      doc.fillColor(COLOR.dark).text(label, x, doc.y, { continued: false, lineBreak: false });
    }

    const lineY = doc.y - 4; // vertical mid of text line

    // Dotted leader
    if (dotsAreaEnd > dotsAreaStart + 10) {
      const dotSpacing = 5;
      doc.fillColor(COLOR.gray);
      for (let dx = dotsAreaStart; dx < dotsAreaEnd; dx += dotSpacing) {
        doc.circle(dx, lineY, 0.7).fill();
      }
    }

    // Page number
    doc.fillColor(COLOR.dark).text(pageStr, PAGE_WIDTH - MARGIN - pageWidth, lineY - 5, { lineBreak: false });

    doc.moveDown(0.65);
  }
}

function drawDataRequestSection(doc: PDFKit.PDFDocument, params: GeneratePdfParams): void {
  sectionHeading(doc, 'Data request summary and data');

  bodyText(doc, 'This section summarizes the parameters used to generate this data download.');
  bodyText(doc, 'The request includes:');

  bullet(doc, 'Area of interest', 'user-selected geographic area');
  bullet(doc, 'Applied filters', 'selected properties, filters, time range, etc.');
  bullet(doc, 'File format', params.fileFormat.toUpperCase());
  bullet(doc, 'Date of extraction', params.exportDate.toISOString().split('T')[0]);

  doc.moveDown(0.5);
  bodyText(doc, 'The downloaded files contain soil observations matching the criteria specified above.');
  bodyText(doc, 'For each dataset included in this data package, links to the metadata page are provided below.');

  for (const { name, url } of params.datasets) {
    const bx = MARGIN + 10;
    doc
      .font(FONT.regular)
      .fontSize(10)
      .fillColor(COLOR.teal)
      .text(`• ${name}`, bx, doc.y, {
        link: url,
        width: CONTENT_WIDTH - 20,
      });
  }
  doc.moveDown(0.5);
}

function drawDataStructureSection(doc: PDFKit.PDFDocument, fileFormat: string): void {
  sectionHeading(doc, 'Data structure');

  bodyText(
    doc,
    'The downloaded data package is organized as one file per soil property. Each file contains observations from multiple datasets that have been harmonized and structured using a common schema.',
  );
  bodyText(doc, 'Depending on the selected format, the data are structured as follows:');

  const fmt = fileFormat.toLowerCase();
  bullet(doc, 'CSV / SHP / GeoJSON: one file per soil property');
  bullet(doc, 'XLSX: one file with one sheet per soil property');
  bullet(doc, 'GPKG: one file with one layer per soil property');

  doc.moveDown(0.5);
  const active =
    fmt === 'csv' || fmt === 'shp' || fmt === 'geojson'
      ? 'CSV / SHP / GeoJSON'
      : fmt === 'xlsx'
        ? 'XLSX'
        : fmt === 'gpkg'
          ? 'GPKG'
          : fileFormat.toUpperCase();
  bodyText(doc, `This export uses the ${active} format.`);
  bodyText(
    doc,
    'Each record represents a single soil observation, including contextual information on sampling depth, analytical procedures, and dataset provenance.',
  );
}

function drawFieldDictionarySection(doc: PDFKit.PDFDocument): void {
  const COL1 = 160;
  const COL2 = CONTENT_WIDTH - COL1;
  const ROW_H = 20;
  const TABLE_X = MARGIN;

  // Header row
  let ty = doc.y;
  doc.rect(TABLE_X, ty, COL1, ROW_H).fillAndStroke('#F5F5F5', COLOR.rule);
  doc.rect(TABLE_X + COL1, ty, COL2, ROW_H).fillAndStroke('#F5F5F5', COLOR.rule);
  doc.font(FONT.bold).fontSize(9).fillColor(COLOR.dark);
  doc.text('Field', TABLE_X + 6, ty + 6, { width: COL1 - 10, lineBreak: false });
  doc.text('Description', TABLE_X + COL1 + 6, ty + 6, { width: COL2 - 10, lineBreak: false });
  ty += ROW_H;

  for (const [field, desc] of Object.entries(FIELD_DESCRIPTIONS)) {
    // measure description height
    const descHeight = Math.max(
      ROW_H,
      doc
        .font(FONT.regular)
        .fontSize(9)
        .heightOfString(desc, { width: COL2 - 12 }) + 8,
    );
    const rowH = Math.max(ROW_H, descHeight);

    doc.rect(TABLE_X, ty, COL1, rowH).stroke(COLOR.rule);
    doc.rect(TABLE_X + COL1, ty, COL2, rowH).stroke(COLOR.rule);
    doc.font(FONT.regular).fontSize(9).fillColor(COLOR.dark);
    doc.text(field, TABLE_X + 6, ty + 6, { width: COL1 - 10, lineBreak: false });
    doc.text(desc, TABLE_X + COL1 + 6, ty + 6, { width: COL2 - 12 });
    ty += rowH;
  }

  doc.y = ty + 10;
  doc.moveDown(0.5);

  bodyText(
    doc,
    'Not all methodological fields are systematically populated, as their availability depends on the metadata provided in the original datasets.',
  );

  bodyText(doc, 'Technique Classification: The technique field provides a general classification of how the reported value was derived:');
  bullet(doc, 'Lab Procedure: measured using a laboratory analytical protocol');
  bullet(doc, 'Spectral: derived from spectral measurements (e.g., NIR or MIR spectroscopy) using calibration models');
  bullet(doc, 'Calculated: computed from other variables using formulas, statistical models, or process-based models');
}

function drawStandardsSection(doc: PDFKit.PDFDocument): void {
  sectionHeading(doc, 'Data and metadata standards');

  subHeading(doc, 'Metadata framework');
  bodyText(
    doc,
    'The SoilHive metadata model aligns with established international standards, including ISO 19115, the INSPIRE Directive, Dublin Core.',
  );
  doc.moveDown(0.5);

  subHeading(doc, 'Data model');
  bodyText(
    doc,
    'The SoilHive data model defines the structure and relationships used to organize soil data and associated metadata across datasets: ',
  );
  doc
    .font(FONT.regular)
    .fontSize(10)
    .fillColor(COLOR.teal)
    .text('Data model', MARGIN, doc.y - 6, {
      link: 'https://soilhive.org/docs/data-model',
      width: CONTENT_WIDTH,
    });
  doc.moveDown(0.5);

  subHeading(doc, 'SoilHive vocabulary');
  bodyText(
    doc,
    'All soil properties are standardized using a controlled vocabulary aligned, where possible, with the GLOSIS ontology developed by FAO. Each property corresponds to a unique concept with a clear definition and a standardized unit of measurement.',
  );
  bodyText(doc, 'This approach supports semantic consistency across datasets and interoperability with external systems. ');
  doc
    .font(FONT.regular)
    .fontSize(10)
    .fillColor(COLOR.teal)
    .text('SoilHive soil data vocabulary', MARGIN, doc.y - 6, {
      link: 'https://soilhive.org/docs/vocabulary',
      width: CONTENT_WIDTH,
    });
  doc.moveDown(0.8);
}

function drawTermsSection(doc: PDFKit.PDFDocument, termsUrl?: string): void {
  sectionHeading(doc, 'Terms and conditions');

  if (termsUrl) {
    bodyText(doc, 'Use of SoilHive data is subject to the platform\u2019s terms and conditions, which can be consulted here: ');
    doc
      .font(FONT.regular)
      .fontSize(10)
      .fillColor(COLOR.teal)
      .text('Terms and Conditions', MARGIN, doc.y - 6, {
        link: termsUrl,
        width: CONTENT_WIDTH,
      });
    doc.moveDown(0.5);
  } else {
    bodyText(
      doc,
      'Use of SoilHive data is subject to the platform\u2019s terms and conditions, which can be consulted on the platform website.',
    );
  }

  bodyText(doc, 'Users must review the license associated with each dataset prior to reuse or redistribution.');
  bodyText(doc, 'When using SoilHive data in publications or derived products, please cite the platform as follows:');

  doc
    .font(FONT.regular)
    .fontSize(10)
    .fillColor(COLOR.dark)
    .text('Varda Foundation. (Year). SoilHive soil data platform [Data platform]. ', MARGIN, doc.y, {
      continued: true,
      width: CONTENT_WIDTH,
    })
    .fillColor(COLOR.teal)
    .text('https://soilhive.org', { link: 'https://soilhive.org', lineBreak: false });
}

// ─── Main entry point ────────────────────────────────────────────────────────

export async function generateExportPdf(params: GeneratePdfParams): Promise<void> {
  const doc = new PDFDocument({ size: 'A4', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN }, bufferPages: true });

  const stream = fs.createWriteStream(params.outputPath);
  doc.pipe(stream);

  // Track page indices when sections begin (0-based internally, displayed 1-based)
  const tocEntries: TocEntry[] = [];
  let tocStartY = 0;

  // ── PAGE 1: Cover ──────────────────────────────────────────────────────────
  drawCoverTitle(doc, params.logoBuffer);

  sectionHeading(doc, 'Intro');
  bodyText(
    doc,
    'This data package contains soil property data distributed through the SoilHive platform. SoilHive aggregates datasets from multiple sources and applies a harmonization workflow to ensure consistency in terminology, data structure, and measurement units across datasets, enabling reliable comparison and integration.',
  );
  bodyText(
    doc,
    'Each dataset included in this package is accompanied by harmonized metadata describing its origin, spatial and temporal coverage, and licensing conditions. This ensures traceability, interoperability, and appropriate reuse.',
  );

  doc.moveDown(0.5);
  sectionHeading(doc, 'Summary');
  tocStartY = doc.y + 4;
  // Reserve space for TOC (filled in after all pages are rendered)
  doc.moveDown(8);

  // Footer for page 1 (no header on cover)
  drawFooter(doc, 1, params.homepageUrl);

  // ── PAGE 2: Data request + Data structure ──────────────────────────────────
  doc.addPage();
  const p2 = doc.bufferedPageRange().count; // 1-based page number
  tocEntries.push({ title: 'Data request summary and data', indent: false, page: p2 });
  tocEntries.push({ title: 'Data structure', indent: false, page: p2 });
  drawHeader(doc, params.logoBuffer);
  drawDataRequestSection(doc, params);
  drawDataStructureSection(doc, params.fileFormat);
  drawFooter(doc, p2, params.homepageUrl);

  // ── PAGE 3: Field dictionary ───────────────────────────────────────────────
  doc.addPage();
  const p3 = doc.bufferedPageRange().count;
  drawHeader(doc, params.logoBuffer);
  drawFieldDictionarySection(doc);
  drawFooter(doc, p3, params.homepageUrl);

  // ── PAGE 4: Standards + Terms ──────────────────────────────────────────────
  doc.addPage();
  const p4 = doc.bufferedPageRange().count;
  tocEntries.push({ title: 'Data and metadata standards', indent: false, page: p4 });
  tocEntries.push({ title: 'Metadata framework', indent: true, indexLabel: '1', page: p4 });
  tocEntries.push({ title: 'Data model', indent: true, indexLabel: '2', page: p4 });
  tocEntries.push({ title: 'SoilHive vocabulary', indent: true, indexLabel: '3', page: p4 });
  tocEntries.push({ title: 'Terms and conditions', indent: false, page: p4 });
  drawHeader(doc, params.logoBuffer);
  drawStandardsSection(doc);
  drawTermsSection(doc, params.termsUrl);
  drawFooter(doc, p4, params.homepageUrl);

  // ── Back to page 1: fill TOC (drawToc calls switchToPage(0) internally) ───
  drawToc(doc, tocEntries, tocStartY);

  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}
