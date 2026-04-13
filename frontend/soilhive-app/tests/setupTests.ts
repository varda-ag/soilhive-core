import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

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
