import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import classnames from 'classnames';

import GraphBar from 'assets/images/analytics-graph-bar.svg?react';
import CloseIcon from 'assets/icons/cross-icon.svg?react';
import ArrowIcon from 'assets/icons/arrow-down-wide-icon.svg?react';
import { AreaInfoContent } from 'components/Map/AreaInfo/AreaInfoContent/AreaInfoContent';
import type { MapSelection } from '../../../../contexts/AvailabilityMapContext';

import styles from './AreaInfoBar.module.scss';

interface Props {
  selection: MapSelection;
  locationName?: string;
  onClose: () => void;
}

export function AreaInfoBar({ selection, locationName, onClose }: Props) {
  const { t } = useTranslation('availability');

  const [isContentOpened, setIsContentOpened] = useState<boolean>(false);

  const toggleContentVisibility = useCallback(() => {
    setIsContentOpened(prevValue => !prevValue);
  }, []);

  return (
    <div className={styles.AreaInfoBar}>
      <div className={styles.AreaInfoBarHeader}>
        <div className={styles.Left}>
          <GraphBar />
          <div className={styles.Title}>{t('map_popup.title')}</div>
        </div>
        <div className={styles.Right}>
          <button data-testid="sh-areainfobar-expand" className={styles.Button} onClick={toggleContentVisibility}>
            <ArrowIcon className={classnames(styles.ArrowIcon, { [styles.Opened]: isContentOpened })} />
          </button>
          <button data-testid="sh-areainfobar-close" className={styles.Button} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      </div>
      <div
        className={classnames(styles.AreaInfoBarContent, {
          [styles.Opened]: isContentOpened,
        })}
      >
        <div>
          <AreaInfoContent selection={selection} locationName={locationName} />
        </div>
      </div>
    </div>
  );
}
