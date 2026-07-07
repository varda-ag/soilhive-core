import type { ColumnSortEvent } from 'primereact/column';
import type { ReactNode } from 'react';
import type { ImmutableLike, StyleSpecification } from 'react-map-gl/maplibre';

export type ComponentSizeType = 'medium' | 'small' | 'tiny';

export type NotificationType = 'error' | 'warning' | 'success';

export interface MenuOption {
  code: string;
  name: string;
  isDisabled?: boolean;
  Icon?: React.FC<React.SVGProps<SVGSVGElement>>;
}

export type MobileTabNavigationConfig = {
  name: string;
  id: string;
  Icon?: React.FC<React.SVGProps<SVGSVGElement>>;
};

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

export type AccordionRef = {
  expand: () => void;
  collapse: () => void;
};

export interface Selection {
  id: string;
  label: string;
  disabled?: boolean;
}

export type NavMenuEntry = {
  name: string;
  route?: string;
  type: 'internal' | 'external';
  Icon?: React.FC<React.SVGProps<SVGSVGElement>>;
  children?: NavMenuEntry[];
};

export type TabData = {
  value: string;
  label: string;
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
  sortFunction?: (event: ColumnSortEvent) => T[];
};

export type InfoCardContent = {
  value: string | number;
  description: string;
  color: string;
};

export type MapStyle = string | StyleSpecification | ImmutableLike<StyleSpecification>;
export type MapStyles = Array<{ name: string; mapStyle: MapStyle; type: string }>;
