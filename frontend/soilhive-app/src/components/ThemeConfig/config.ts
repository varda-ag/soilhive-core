interface ThemeConfigItem {
    label: string;
    name: string;
};

export const config: ThemeConfigItem[] = [
    {
        label: 'Primary color',
        name: 'primary',
    },
    {
        label: 'Primary hover color',
        name: 'primary-hover',
    },
    {
        label: 'Primary active color',
        name: 'primary-active',
    },
    {
        label: 'Primary disabled color',
        name: 'primary-disabled',
    },
    {
        label: 'Secondary color',
        name: 'secondary',
    },
    {
        label: 'Secondary hover color',
        name: 'secondary-hover',
    },
    {
        label: 'Secondary active color',
        name: 'secondary-active',
    },
    {
        label: 'Secondary disabled color',
        name: 'secondary-disabled',
    },
];
