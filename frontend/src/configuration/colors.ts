import type { ColorsConfigSection, ThemeColors } from 'types/config';

export const defaultColors: ThemeColors = {
  'primary-default': '#3E7F77',
  'primary-hover': '#004f29',
  'primary-text': '#FFFFFF',
  'secondary-default': '#3E7F77',
  'secondary-hover': '#004f29',
  'tertiary-default': '#3E7F77',
  'tertiary-hover': '#004f29',
  'pill-background': '#F5B200',
  'pill-text': '#000000',
  'background-primary': '#D2E5AB',
  'background-secondary': '#EAEFE0',
};

export const colorsSettingsConfig: ColorsConfigSection[] = [
  {
    name: 'primary',
    fields: [
      {
        name: 'primary-default',
        tooltip: true,
      },
      {
        name: 'primary-hover',
        tooltip: true,
      },
      {
        name: 'primary-text',
      },
    ],
  },
  {
    name: 'secondary',
    applyPrimary: true,
    fields: [
      {
        name: 'secondary-default',
        tooltip: true,
      },
      {
        name: 'secondary-hover',
        tooltip: true,
      },
    ],
  },
  {
    name: 'tertiary',
    applyPrimary: true,
    applySecondary: true,
    fields: [
      {
        name: 'tertiary-default',
        tooltip: true,
      },
      {
        name: 'tertiary-hover',
        tooltip: true,
      },
    ],
  },
  {
    name: 'pill',
    applyPrimary: true,
    applySecondary: true,
    fields: [
      {
        name: 'pill-background',
      },
      {
        name: 'pill-text',
      },
    ],
  },
  {
    name: 'background',
    fields: [
      {
        name: 'background-primary',
      },
      {
        name: 'background-secondary',
      },
    ],
  },
];
