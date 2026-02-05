export const isJest = () => process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';

export const sleep = async (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const sanitizeField = (field: string) => {
  return field
    .toLowerCase()
    .replace('-', '_')
    .replace(/[^a-z0-9_]/g, '');
};
