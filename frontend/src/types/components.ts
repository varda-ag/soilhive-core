import type { ColumnSortEvent } from 'primereact/column';
import type { ReactNode } from 'react';
import type { ImmutableLike, StyleSpecification } from 'react-map-gl/maplibre';

export type NestedCheckboxItemType = {
  id: string;
  label: string;
  className?: string;
  children: NestedCheckboxItemType[];
  isRoot: boolean;
  categoryId?: string;
};

export type NestedCheckboxRef = {
  expandAll: () => void;
  collapseAll: () => void;
};

export type NavMenuEntry = {
  name: string;
  route?: string;
  type: 'internal' | 'external';
  Icon?: React.FC<React.SVGProps<SVGSVGElement>>;
  children?: NavMenuEntry[];
};

export type CropArea = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TableColumn<T> = {
  name: ReactNode;
  value: string;
  sortable?: boolean;
  reorderable?: boolean;
  headerTooltip?: string;
  bodyTemplate?: (row: T) => ReactNode;
  bodyClassName?: string;
  sortFunction?: (event: ColumnSortEvent) => T[];
  frozen?: boolean;
  alignFrozen?: 'left' | 'right';
};

export type MapStyle = string | StyleSpecification | ImmutableLike<StyleSpecification>;
export type MapStyles = Array<{ name: string; mapStyle: MapStyle; type: string }>;
