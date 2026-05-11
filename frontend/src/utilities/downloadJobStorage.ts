const STORAGE_KEY = 'download_job_ids';

export function getStoredJobIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function addStoredJobId(id: string): void {
  const ids = getStoredJobIds();
  if (!ids.includes(id)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids, id]));
  }
}

export function removeStoredJobId(id: string): void {
  const ids = getStoredJobIds().filter(jobId => jobId !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}
