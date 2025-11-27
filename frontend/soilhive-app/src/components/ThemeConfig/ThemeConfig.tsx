import { useCallback } from 'react';
import useTheme from '../../hooks/useTheme';
import { Button, TextInput } from 'components/UI';
import { config } from './config';

import styles from './ThemeConfig.module.scss';

export function ThemeConfig() {
    const {theme, logo, handleChange, handleLogoChange, saveThemeConfig} = useTheme();

    const onChange = useCallback(({target: {name, value}}: React.ChangeEvent<HTMLInputElement>) => {
        console.log(name, value);
        handleChange(name, value)
    }, [handleChange]);

  return (
    <div className={styles.Wrapper}>
      <h1>Theme config</h1>
      {config.map(({label, name, type}) => {
        if (type === 'color') {
            return (
                <>
                    <div>
                        <label htmlFor={name}>{label}:</label>
                        <input id={name} name={name} type="color" value={theme?.[name]} onChange={onChange}/>
                    </div>
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
                </>
            )
        }

        return null;
      })}
      <div><Button onClick={saveThemeConfig}>Save</Button></div>
      <div><Button to="/">Go Home</Button></div>
      <div><Button href="https://google.com">Google</Button></div>
      <div><TextInput isClearable={true} /></div>
        <div>
            <TextInput
                label="Label"
                labelTooltip='Tooltip'
                isRequired={true}
                helperMessage='Helper message'
                errorMessage='errorMessage'
                isError={true}
            />
        </div>
    </div>
  );
};

export default ThemeConfig;
