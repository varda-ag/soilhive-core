import type { Selection } from 'types/components';

const DATA_TYPE_ITEMS: Selection[] = [
  {
    id: 'point',
    label: 'Point',
  },
  {
    id: 'raster',
    label: 'Raster',
  },
  {
    id: 'polygonal',
    label: 'Polygonal',
  },
];

const DATA_ACCESS_ITEMS: Selection[] = [
  {
    id: 'private',
    label: 'Private',
  },
  {
    id: 'public',
    label: 'Public',
  },
];

export { DATA_TYPE_ITEMS, DATA_ACCESS_ITEMS };
