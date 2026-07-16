import { getStoredJobIds, addStoredJobId, removeStoredJobId } from '../../src/utilities/downloadJobStorage';

const STORAGE_KEY = 'download_job_ids';

function setStorage(value: Record<string, string[]>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

describe('downloadJobStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('getStoredJobIds', () => {
    it('returns [] when storage is empty', () => {
      expect(getStoredJobIds(null)).toEqual([]);
      expect(getStoredJobIds('user-1')).toEqual([]);
    });

    it('returns guest jobs when userId is null', () => {
      setStorage({ guest: ['job-1', 'job-2'] });
      expect(getStoredJobIds(null)).toEqual(['job-1', 'job-2']);
    });

    it('returns only guest jobs for null userId, ignoring other users', () => {
      setStorage({ guest: ['job-1'], 'user-1': ['job-2'] });
      expect(getStoredJobIds(null)).toEqual(['job-1']);
    });

    it("returns user's own jobs combined with guest jobs for a logged-in user", () => {
      setStorage({ 'user-1': ['job-1'], guest: ['job-2'] });
      expect(getStoredJobIds('user-1')).toEqual(['job-1', 'job-2']);
    });

    it("returns only user's own jobs when there are no guest jobs", () => {
      setStorage({ 'user-1': ['job-1', 'job-2'] });
      expect(getStoredJobIds('user-1')).toEqual(['job-1', 'job-2']);
    });

    it('returns [] when user has no jobs and there are no guest jobs', () => {
      setStorage({ 'user-2': ['job-1'] });
      expect(getStoredJobIds('user-1')).toEqual([]);
    });

    it('returns [] and does not throw when storage contains invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json');
      expect(getStoredJobIds(null)).toEqual([]);
      expect(getStoredJobIds('user-1')).toEqual([]);
    });
  });

  describe('addStoredJobId', () => {
    it('adds a job to the guest list when userId is null', () => {
      addStoredJobId('job-1', null);
      expect(getStoredJobIds(null)).toEqual(['job-1']);
    });

    it("adds a job to the user's list when userId is provided", () => {
      addStoredJobId('job-1', 'user-1');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored['user-1']).toEqual(['job-1']);
      expect(stored['guest']).toBeUndefined();
    });

    it('does not add a duplicate if the job is already in the guest list', () => {
      setStorage({ guest: ['job-1'] });
      addStoredJobId('job-1', null);
      expect(getStoredJobIds(null)).toEqual(['job-1']);
    });

    it("does not add a duplicate if the job is already in the user's list", () => {
      setStorage({ 'user-1': ['job-1'] });
      addStoredJobId('job-1', 'user-1');
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)['user-1']).toEqual(['job-1']);
    });

    it('does not add a duplicate for a logged-in user if the job is in the guest list', () => {
      setStorage({ guest: ['job-1'] });
      addStoredJobId('job-1', 'user-1');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored['user-1']).toBeUndefined();
    });

    it('does not throw when storage contains invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json');
      expect(() => addStoredJobId('job-1', 'user-1')).not.toThrow();
    });

    it('preserves existing jobs when adding a new one', () => {
      setStorage({ 'user-1': ['job-1'], guest: ['job-2'] });
      addStoredJobId('job-3', 'user-1');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored['user-1']).toEqual(['job-1', 'job-3']);
      expect(stored['guest']).toEqual(['job-2']);
    });
  });

  describe('removeStoredJobId', () => {
    it("removes a job from the user's list", () => {
      setStorage({ 'user-1': ['job-1', 'job-2'] });
      removeStoredJobId('job-1', 'user-1');
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)['user-1']).toEqual(['job-2']);
    });

    it('removes a job from the guest list when userId is null', () => {
      setStorage({ guest: ['job-1', 'job-2'] });
      removeStoredJobId('job-1', null);
      expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)['guest']).toEqual(['job-2']);
    });

    it('removes a job from the guest list when it is not in the user list', () => {
      setStorage({ 'user-1': ['job-2'], guest: ['job-1'] });
      removeStoredJobId('job-1', 'user-1');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored['user-1']).toEqual(['job-2']);
      expect(stored['guest']).toEqual([]);
    });

    it("prefers removing from the user's list over guest when both contain the job", () => {
      setStorage({ 'user-1': ['job-1'], guest: ['job-1'] });
      removeStoredJobId('job-1', 'user-1');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored['user-1']).toEqual([]);
      expect(stored['guest']).toEqual(['job-1']);
    });

    it('does nothing when the job is not in any list', () => {
      setStorage({ 'user-1': ['job-2'], guest: ['job-3'] });
      removeStoredJobId('job-1', 'user-1');
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
      expect(stored['user-1']).toEqual(['job-2']);
      expect(stored['guest']).toEqual(['job-3']);
    });

    it('does not throw when storage contains invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, 'not-json');
      expect(() => removeStoredJobId('job-1', 'user-1')).not.toThrow();
    });
  });
});
