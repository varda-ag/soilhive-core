export type ThemeColors = Record<string, string>;

export type ThemeConfig = {
  colors: ThemeColors;
  termsAndConditionsHtml: string;
  termsAndConditionsLatestUpdate: string;
  privacyPolicyHtml: string;
  privacyPolicyLatestUpdate: string;
  notificationBannerHtml: string;
  initialBbox: [number, number, number, number];
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
