import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

// jsdom ships no canvas implementation: getContext('2d') already returns null,
// but it also logs a "Not implemented" error for every call.
// Guarded: this file also runs for suites using the node test environment,
// which has no DOM globals at all.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = () => null;
}

if (typeof global.structuredClone === 'undefined') {
  global.structuredClone = <T>(obj: T): T => JSON.parse(JSON.stringify(obj));
}

export const testTimezones = [
  { tz: 'UTC' },
  { tz: 'Europe/London' },
  { tz: 'US/Pacific' },
  { tz: 'US/Eastern' },
  { tz: 'America/Anchorage' },
  { tz: 'Brazil/East' },
  { tz: 'Australia/Adelaide' },
  { tz: 'Etc/GMT-1' },
  { tz: 'Etc/GMT+1' },
  { tz: 'Etc/GMT-9' },
  { tz: 'Etc/GMT+9' },
];
