export function isEmptyString(value: string): boolean {
  return !value.trim();
}

export function arraysMatch(a: string[], b: string[]): boolean {
  return [...a].sort().join(',') === [...b].sort().join(',');
}
