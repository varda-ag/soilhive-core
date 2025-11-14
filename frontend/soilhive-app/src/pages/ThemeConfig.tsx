import { useCallback } from 'react';
import useTheme from '../hooks/useTheme';

export function ThemeConfig() {
    const {theme, logo, handleChange, handleLogoChange, saveThemeConfig} = useTheme();

    const onChange = useCallback(({target: {name, value}}) => {
        console.log(name, value);
        handleChange(name, value)
    }, [handleChange]);

  return (
    <div className="theme-page">
      <h1>Theme config</h1>
      <div>
        <label htmlFor="primary">Primary color:</label>
        <input id="primary" name="primary" type="color" value={theme?.primary} onChange={onChange}/>
      </div>
      <br />
      <div>
        <label htmlFor="secondary">Secondary color:</label>
        <input id="secondary" name="secondary" type="color" value={theme?.secondary} onChange={onChange}/>
      </div>
      <br />
      <div>
        <label htmlFor="secondary">Logo:</label>
        <input id="logo" name="logo" type="file" onChange={handleLogoChange} multiple={false}/>
        {!!logo && <img src={logo} style={{width: '50px', height: '20px'}} />}
      </div>
      <br />
      <div><button onClick={saveThemeConfig}>Save</button></div>
    </div>
  );
};

export default ThemeConfig;
