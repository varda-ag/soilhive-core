import { render } from '@testing-library/react';
import { DatasetsTableUpdatedAtTemplate } from 'components/AdminPortal/DatasetsPublicationTable/DatasetsTableUpdatedAtTemplate/DatasetsTableUpdatedAtTemplate';

describe('DatasetsTableUpdatedAtTemplate', () => {
  it('returns em dash when updated_at is null', () => {
    const { container } = render(<DatasetsTableUpdatedAtTemplate updated_at={null} />);
    expect(container.textContent).toBe('—');
  });

  it('formats date as DD-MM-YYYY', () => {
    const { container } = render(<DatasetsTableUpdatedAtTemplate updated_at={new Date(2024, 2, 15)} />);
    expect(container.textContent).toBe('15-03-2024');
  });

  it('pads single-digit day and month with leading zeros', () => {
    const { container } = render(<DatasetsTableUpdatedAtTemplate updated_at={new Date(2024, 0, 5)} />);
    expect(container.textContent).toBe('05-01-2024');
  });
});
