import { useTranslation } from 'react-i18next';

interface Props {
  visibility?: string;
}

export function DatasetsTableVisibilityTemplate({ visibility }: Props) {
  const { t } = useTranslation('admin');

  return visibility ? t(`datasets.list.visibility.${visibility}`) : '-';
}
