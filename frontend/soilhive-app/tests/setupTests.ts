import '@testing-library/jest-dom';
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder as any;
global.TextDecoder = TextDecoder as any;

export const testTimezones = [
  { tz: 'UTC', offsetMs: 0 },
  { tz: 'Europe/Rome', offsetMs: 60 * 60 * 1000 }, // UTC+1 (winter)
  { tz: 'Asia/Tokyo', offsetMs: 9 * 60 * 60 * 1000 }, // UTC+9
  { tz: 'America/Anchorage', offsetMs: -9 * 60 * 60 * 1000 }, // UTC-9
];
