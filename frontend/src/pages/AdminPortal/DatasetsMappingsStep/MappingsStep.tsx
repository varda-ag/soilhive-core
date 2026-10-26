import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FormMessage } from 'components/UI';
import { MappingsBanner } from './MappingsBanner';
import { IngestionStepTitleRow } from 'components/AdminPortal/IngestionStepTitleRow/IngestionStepTitleRow';
import styles from './MappingsStep.module.scss';

type MessageType = 'error' | 'warning' | 'info';

interface Props {
  datasetName: string;
  title: string;
  subtitle: string;
  docsLink: string;
  isRaster: boolean;
  mappedCount: number;
  unmappedCount: number;
  messages?: ({ type: MessageType; message: string } | null)[];
  isSaveEnabled?: boolean;
  isContinueEnabled: boolean;
  onPrevious: () => void;
  onSaveAndContinueLater: () => void;
  onContinue: () => void;
  children: ReactNode;
}

export function MappingsStep({
  datasetName,
  title,
  subtitle,
  docsLink,
  isRaster,
  mappedCount,
  unmappedCount,
  messages,
  isSaveEnabled = true,
  isContinueEnabled,
  onPrevious,
  onSaveAndContinueLater,
  onContinue,
  children,
}: Props) {
  const { t } = useTranslation('admin');
  const visibleMessages = (messages ?? []).filter((m): m is { type: MessageType; message: string } => !!m);

  return (
    <>
      <div className={styles.MappingsStep}>
        <IngestionStepTitleRow className={styles.TitleRow} title={title} datasetName={datasetName} docsLink={docsLink} />
        <p className={styles.Subtitle}>{subtitle}</p>

        <MappingsBanner mappedCount={mappedCount} unmappedCount={unmappedCount} isRaster={isRaster} />

        {visibleMessages.length > 0 && (
          <div className={styles.Messages}>
            {visibleMessages.map((m, i) => (
              <FormMessage key={i} type={m.type} message={m.message} withBackground />
            ))}
          </div>
        )}

        {children}
      </div>

      <div className={styles.Actions}>
        <Button type="secondary" onClick={onPrevious} dataTestId="sh-mappings-previous">
          {t('datasets.actions.previous')}
        </Button>
        <div className={styles.ActionsSpacer} />
        <Button type="secondary" onClick={onSaveAndContinueLater} dataTestId="sh-mappings-save-later" isDisabled={!isSaveEnabled}>
          {t('datasets.actions.save_and_continue_later')}
        </Button>
        <Button type="primary" onClick={onContinue} dataTestId="sh-mappings-continue" isDisabled={!isContinueEnabled}>
          {t('datasets.actions.continue')}
        </Button>
      </div>
    </>
  );
}
