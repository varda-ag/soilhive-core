import { type Dispatch } from 'react';
import classnames from 'classnames';
import type { MapStyles } from 'types/components';

import styles from './MapStyleSwitcherDesktop.module.scss';

interface Props {
  mapStyles: MapStyles;
  currentValue: number;
  className?: string;
  onMapStyleChange: Dispatch<number>;
}
export function MapStyleSwitcherDesktop({ mapStyles, currentValue, className, onMapStyleChange }: Props) {
  return (
    <div className={classnames(styles.MapStyleSwitcherDesktop, className)}>
      <select
        name="map-styles"
        className={styles.Select}
        defaultValue={currentValue}
        onChange={event => {
          onMapStyleChange(Number(event.target.value));
        }}
      >
        {mapStyles.map(({ name }, index) => {
          return (
            <option key={index} value={index}>
              {name}
            </option>
          );
        })}
      </select>
    </div>
  );
}
