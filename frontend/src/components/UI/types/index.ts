export type AccordionRef = {
  expand: () => void;
  collapse: () => void;
};

export type ComponentSizeType = 'medium' | 'small' | 'tiny';

export interface MenuOption {
  code: string;
  name: string;
  isDisabled?: boolean;
  Icon?: React.FC<React.SVGProps<SVGSVGElement>>;
  // The heading the option is listed under. A heading starts each run of consecutive options with
  // the same group, so list each group's options together.
  group?: string;
}

export type InfoCardContent = {
  value: string | number;
  description: string;
  color: string;
};

export type MobileTabNavigationConfig = {
  name: string;
  id: string;
  Icon?: React.FC<React.SVGProps<SVGSVGElement>>;
};

export interface Selection {
  id: string;
  label: string;
  disabled?: boolean;
}

export type NotificationType = 'error' | 'warning' | 'success';

export type TabData = {
  value: string;
  label: string;
};
