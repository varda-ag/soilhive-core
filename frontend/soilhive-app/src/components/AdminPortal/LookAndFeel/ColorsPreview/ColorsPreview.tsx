import { useTranslation } from 'react-i18next';
import { Button } from 'components/UI';

import styles from './ColorsPreview.module.scss';
import useLookAndFeel from 'hooks/useLookAndFeel';
import { useMemo } from 'react';
import { Pill } from 'components/UI/SelectionPills/Pill';
import { DatasetsSidebarSummary } from 'components/DatasetsSidebar/DatasetsSidebarSummary/DatasetsSidebarSummary';
import type { DatasetSummary } from 'types/availability';
import { DatasetsSidebarHeader } from 'components/DatasetsSidebar/DatasetsSidebarHeader/DatasetsSidebarHeader';

const datasetsSummary = {
  count: 5,
  dataPoints: 7367,
  layers: 4,
  depth: '0-60',
  date: '2016 - 2025',
} as DatasetSummary;

export function ColorsPreview() {
  const { t } = useTranslation('admin');
  const { colors } = useLookAndFeel();

  const variables = useMemo(() => {
    const colorVariables: Record<string, string> = {};
    Object.entries(colors).forEach(([key, value]) => {
      colorVariables[`--color-${key}`] = value;
    });
    return colorVariables;
  }, [colors]);

  return (
    <div className={styles.ColorsPreview} style={variables}>
      <div className={styles.Section}>
        <h3 className={styles.Title}>Buttons states</h3>
        <div className={styles.Buttons}>
          <Button className={styles.Button} size="tiny">
            {t('Primary button')}
          </Button>
          <Button className={styles.Button} type="secondary" size="tiny">
            {t('Secondary button')}
          </Button>
          <Button className={styles.Button} type="tertiary" size="tiny">
            {t('Tertiary button')}
          </Button>
        </div>
      </div>
      <div className={styles.Section}>
        <h3 className={styles.Title}>Filter pills</h3>
        <Pill selection={{ label: 'Organic Carbon Content', id: 'test' }} onRemove={() => {}} />
      </div>
      <div className={styles.Section}>
        <h3 className={styles.Title}>Backgrounds</h3>
        <DatasetsSidebarHeader preview />
        <DatasetsSidebarSummary datasetsSummary={datasetsSummary} preview />
      </div>
    </div>
  );
}
