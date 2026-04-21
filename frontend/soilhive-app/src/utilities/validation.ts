export function isEmptyString(value: string): boolean {
  return !value.trim();
}

export function allArraysMatch(arrays: (string[] | undefined)[]): boolean {
  const defined = arrays.filter((a): a is string[] => a !== undefined);
  if (defined.length < 2) return true;
  const reference = [...defined[0]].sort().join(',');
  return defined.every(a => [...a].sort().join(',') === reference);
}
