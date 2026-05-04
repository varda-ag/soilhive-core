export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isEmptyString(value: string): boolean {
  return !value.trim();
}

export function hasTextContent(html: string | null | undefined): boolean {
  if (!html?.trim()) return false;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return !!doc.body.textContent?.trim();
}

export function arraysMatch(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort(),
    sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}
