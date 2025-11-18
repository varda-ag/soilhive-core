import { useCallback } from 'react';
import useTheme from '../hooks/useTheme';
import { Button, TextInput } from '../components/UI';

export function ThemeConfig() {
    const {theme, logo, handleChange, handleLogoChange, saveThemeConfig} = useTheme();

    const onChange = useCallback(({target: {name, value}}: React.ChangeEvent<HTMLInputElement>) => {
        console.log(name, value);
        handleChange(name, value)
    }, [handleChange]);

    const config = [
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

  return (
    <div className="theme-page" style={{padding: '0 20px'}}>
      <h1>Theme config</h1>
      {config.map(({label, name, type}) => {
        if (type === 'color') {
            return (
                <>
                    <div>
                        <label htmlFor={name}>{label}:</label>
                        <input id={name} name={name} type="color" value={theme?.[name]} onChange={onChange}/>
                    </div>
                    <br />
                </>
            )
        }

        if (type === 'file') {
            return (
                <>
                    <div>
                        <label htmlFor={name}>{label}:</label>
                        <input id={name} name={name} type="file" onChange={handleLogoChange} multiple={false}/>
                        {!!logo && <img src={logo} style={{width: '50px', height: '20px'}} />}
                    </div>
                    <br />
                </>
            )
        }

        return null;
      })}
      <div><Button onClick={saveThemeConfig}>Save</Button></div><br />
      <div><Button to="/">Go Home</Button></div><br />
      <div><Button href="https://google.com">Google</Button></div><br />
      <div><TextInput isClearable={true} /></div><br />
    </div>
  );
};

export default ThemeConfig;
