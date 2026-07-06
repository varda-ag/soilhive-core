import { useCallback, useState, type Dispatch } from 'react';
import classnames from 'classnames';
import type { MapStyles } from 'types/components';
import MapIcon from 'assets/icons/map-icon.svg?react';
import satteliteThumbnail from 'assets/images/sattelite-thumbnail.png';
import mapThumbnail from 'assets/images/map-thumbnail.png';

import styles from './MapStyleSwitcher.module.scss';
import { Dialog } from 'components/UI';
import { useTranslation } from 'react-i18next';

interface Props {
  mapStyles: MapStyles;
  currentValue: number;
  className?: string;
  onMapStyleChange: Dispatch<number>;
}
export function MapStyleSwitcher({ mapStyles, currentValue, className, onMapStyleChange }: Props) {
  const { t } = useTranslation('availability');
  const [isVisible, setIsVisible] = useState<boolean>(false);

  const handleSelect = useCallback(
    (index: number) => {
      onMapStyleChange(index);
      setIsVisible(false);
    },
    [onMapStyleChange],
  );

  const getThumbnail = useCallback((type: string) => {
    if (type === 'satellite') {
      return satteliteThumbnail;
    }

    return mapThumbnail;
  }, []);

  return (
    <div className={classnames(styles.MapStyleSwitcher, className)}>
      <button className={styles.SwitcherButton} onClick={() => setIsVisible(true)}>
        <MapIcon data-testid="map-icon" className={styles.MapIcon} />
      </button>
      <Dialog
        className={styles.Dialog}
        contentClassName={styles.DialogContent}
        visible={isVisible}
        header={t('map_style_switcher.popup_title')}
        onClose={() => setIsVisible(false)}
        hideButtons={true}
      >
        <div className={styles.List}>
          {mapStyles.map(({ name, type }, index) => (
            <div
              key={name}
              className={classnames(styles.ListItem, {
                [styles.Active]: currentValue === index,
              })}
              role="button"
              onClick={() => handleSelect(index)}
            >
              <div className={styles.ThumbnailWrapper}>
                <img src={getThumbnail(type)} className={styles.Thumbnail} />
              </div>
              <span className={styles.Name}>
                {name} {type}
              </span>
            </div>
          ))}
        </div>
      </Dialog>
    </div>
  );
}
