import { RasterFilterInstallStatus, type RasterFilterCategory } from 'types/backend';

export const IN_PROGRESS_INSTALL_STATUSES = [RasterFilterInstallStatus.QUEUED, RasterFilterInstallStatus.INSTALLING];

// A filter without an install report was never installed through the API
export const getInstallStatus = (filter: RasterFilterCategory) => filter.install?.status ?? RasterFilterInstallStatus.NOT_INSTALLED;

export const isInstallInProgress = (status: RasterFilterInstallStatus) => IN_PROGRESS_INSTALL_STATUSES.includes(status);
