import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import type { LogAttributes } from '@opentelemetry/api-logs';
import { LoggerProvider, SimpleLogRecordProcessor } from '@opentelemetry/sdk-logs';
import type { ReadableLogRecord, LogRecordExporter } from '@opentelemetry/sdk-logs';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { ExportResult, ExportResultCode, hrTimeToMilliseconds } from '@opentelemetry/core';

class JsonConsoleLogExporter implements LogRecordExporter {
  export(records: ReadableLogRecord[], resultCallback: (result: ExportResult) => void): void {
    for (const record of records) {
      const line = JSON.stringify({
        timestamp: new Date(hrTimeToMilliseconds(record.hrTime)).toISOString(),
        level: record.severityText ?? 'INFO',
        message: record.body,
        service: record.resource.attributes[ATTR_SERVICE_NAME],
        ...record.attributes,
      });
      const severity = record.severityNumber ?? SeverityNumber.UNSPECIFIED;
      if (severity >= SeverityNumber.ERROR) {
        console.error(line);
      } else if (severity >= SeverityNumber.WARN) {
        console.warn(line);
      } else {
        console.log(line);
      }
    }
    resultCallback({ code: ExportResultCode.SUCCESS });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}

const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env['SERVICE_NAME'] ?? 'soilhive-backend',
  [ATTR_SERVICE_VERSION]: process.env['SERVICE_VERSION'] ?? '0.0.0',
});

const provider = new LoggerProvider({
  resource,
  processors: [new SimpleLogRecordProcessor(new JsonConsoleLogExporter())],
});
logs.setGlobalLoggerProvider(provider);

const logger = logs.getLogger('soilhive-backend');

const emit = (severityNumber: SeverityNumber, severityText: string, message: string, attributes?: LogAttributes) =>
  logger.emit({ severityNumber, severityText, body: message, attributes: attributes ?? {} });

export const log = {
  debug: (message: string, attributes?: LogAttributes) => emit(SeverityNumber.DEBUG, 'DEBUG', message, attributes),
  info: (message: string, attributes?: LogAttributes) => emit(SeverityNumber.INFO, 'INFO', message, attributes),
  warn: (message: string, attributes?: LogAttributes) => emit(SeverityNumber.WARN, 'WARN', message, attributes),
  error: (message: string, attributes?: LogAttributes) => emit(SeverityNumber.ERROR, 'ERROR', message, attributes),
};
