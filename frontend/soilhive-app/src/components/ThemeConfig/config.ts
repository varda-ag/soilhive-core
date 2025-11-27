interface ThemeConfigItem {
    label: string;
    type: string;
    name: string;
};

export const config: ThemeConfigItem[] = [
    {
        label: 'Primary color',
        type: 'color',
        name: 'primary',
    },
    {
        label: 'Primary hover color',
        type: 'color',
        name: 'primary-hover',
    },
    {
        label: 'Primary active color',
        type: 'color',
        name: 'primary-active',
    },
    {
        label: 'Primary disabled color',
        type: 'color',
        name: 'primary-disabled',
    },
    {
        label: 'Secondary color',
        type: 'color',
        name: 'secondary',
    },
    {
        label: 'Secondary hover color',
        type: 'color',
        name: 'secondary-hover',
    },
    {
        label: 'Secondary active color',
        type: 'color',
        name: 'secondary-active',
    },
    {
        label: 'Secondary disabled color',
        type: 'color',
        name: 'secondary-disabled',
    },
    {
        label: 'Logo',
        type: 'file',
        name: 'logo',
    },
];
