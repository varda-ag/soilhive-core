export type ComponentSizeType = 'medium' | 'small' | 'tiny';

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
};

export type NestedCheckboxRef = {
  expandAll: () => void;
  collapseAll: () => void;
};

export interface Selection {
  id: string;
  label: string;
}
