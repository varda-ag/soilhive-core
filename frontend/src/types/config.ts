import type { Plugin } from './plugins';

export type ThemeColors = Record<string, string>;

export type DaiConfig = {
  isEnabled: boolean;
  defaultValue: boolean;
};

export type ThemeConfig = {
  colors: ThemeColors;
  defaultColors: ThemeColors | undefined;
  termsAndConditionsHtml: string;
  termsAndConditionsLatestUpdate: string;
  privacyPolicyHtml: string;
  privacyPolicyLatestUpdate: string;
  notificationBannerHtml: string;
  initialBbox: [number, number, number, number];
  plugins: Plugin[];
  daiConfig: DaiConfig;
};

export type ColorsConfigField = {
  name: string;
  tooltip?: boolean;
};

export type ColorsConfigSection = {
  name: string;
  fields: ColorsConfigField[];
  applyPrimary?: boolean;
  applySecondary?: boolean;
};
