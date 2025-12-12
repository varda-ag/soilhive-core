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
