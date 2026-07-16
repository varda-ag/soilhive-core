const STORAGE_KEY = 'download_job_ids';
const NOT_LOGGED_IN_KEY = 'guest';

type StoredJobs = Record<string, string[]>;

export function getStoredJobIds(userId: string | null): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsedJobsList = JSON.parse(raw) as StoredJobs;
    const guestJobs = parsedJobsList[NOT_LOGGED_IN_KEY] || [];

    if (!userId) return guestJobs;
    return [...(parsedJobsList[userId] || []), ...guestJobs];
  } catch {
    return [];
  }
}

export function addStoredJobId(id: string, userId: string | null): void {
  try {
    if (getStoredJobIds(userId).includes(id)) return;
    const raw = localStorage.getItem(STORAGE_KEY) || '{}';
    const parsedJobsList = JSON.parse(raw) as StoredJobs;
    const key = userId || NOT_LOGGED_IN_KEY;
    const updatedJobsList: StoredJobs = { ...parsedJobsList, [key]: [...(parsedJobsList[key] || []), id] };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedJobsList));
  } catch {
    return;
  }
}

export function removeStoredJobId(id: string, userId: string | null): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || '{}';
    const parsedJobsList = JSON.parse(raw) as StoredJobs;

    let updatedJobsList = { ...parsedJobsList };
    if (userId && (parsedJobsList[userId] || []).includes(id)) {
      updatedJobsList = { ...updatedJobsList, [userId]: parsedJobsList[userId].filter(jobId => jobId !== id) };
    } else if ((parsedJobsList[NOT_LOGGED_IN_KEY] || []).includes(id)) {
      updatedJobsList = {
        ...updatedJobsList,
        [NOT_LOGGED_IN_KEY]: (parsedJobsList[NOT_LOGGED_IN_KEY] || []).filter(jobId => jobId !== id),
      };
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedJobsList));
  } catch {
    return;
  }
}
