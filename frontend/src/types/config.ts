import type { Plugin } from './plugins';

export type ThemeColors = Record<string, string>;

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
