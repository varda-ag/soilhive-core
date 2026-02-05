/**
 *
 * Replace a slug only if it is the latest segment of a path. Also works with query params.
 */
export const getNewPath = (originalUrl: string, oldSlug: string, newSlug: string): string => {
  const [path, queryString] = originalUrl.split('?');

  if (!path) return originalUrl;

  const pathSegments = path.split('/');

  if (pathSegments[pathSegments.length - 1] === oldSlug) {
    pathSegments[pathSegments.length - 1] = newSlug;
  }

  const newPath = pathSegments.join('/');

  return queryString ? `${newPath}?${queryString}` : newPath;
};
