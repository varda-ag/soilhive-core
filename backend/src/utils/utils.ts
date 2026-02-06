export const isJest = () => process.env.JEST_WORKER_ID !== undefined || process.env.NODE_ENV === 'test';

export const sleep = async (ms: number) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const sanitizeField = (field: string, removeSpacePlaceholders: boolean = false) => {
  let replaceString = /[^a-z0-9_]/g;
  if (removeSpacePlaceholders) {
    replaceString = /[^a-z]/g;
  }
  return field.toLowerCase().replace('-', '_').replace(replaceString, '');
};
