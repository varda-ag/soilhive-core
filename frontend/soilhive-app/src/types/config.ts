export type ThemeColors = Record<string, string>;

export type ThemeConfig = {
  colors: ThemeColors;
  termsAndConditionsHtml: string;
  initialBbox: [number, number, number, number];
};
