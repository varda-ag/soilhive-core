interface Props {
  updated_at: Date | null;
}

export function DatasetsTableUpdatedAtTemplate({ updated_at }: Props) {
  if (!updated_at) return '—';

  const date = new Date(updated_at);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();

  return `${day}-${month}-${year}`;
}
