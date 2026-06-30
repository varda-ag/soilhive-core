import { render, screen } from '@testing-library/react';
import { PreviewStepSummary } from '../../../../src/pages/AdminPortal/DatasetsPreviewStep/PreviewStepSummary/PreviewStepSummary';
import type { SoilDataSummary } from 'types/datasetsPublication';
import { CellDeleteReason, CellModifyReason, RowDeleteReason } from 'types/backend';

jest.mock('pages/AdminPortal/DatasetsPreviewStep/PreviewStepSummary/PreviewSummaryAccordion/PreviewSummaryAccordion', () => ({
  PreviewSummaryAccordion: ({ config, isLast }: any) => (
    <div data-testid="preview-summary-accordion" data-is-last={String(!!isLast)} data-total={config.total}>
      <span>{config.title}</span>
    </div>
  ),
}));

const baseSoilDataSummary: SoilDataSummary = {
  summary: { values_modified: 30, rows_deleted: 5, cells_deleted: 12 },
  modifications: {
    [CellModifyReason.DEPTH_ROUNDED]: 10,
    [CellModifyReason.VALUE_ROUNDED]: 15,
    [CellModifyReason.UNIT_CONVERTED]: 5,
  },
  row_deletions: {
    [RowDeleteReason.INVALID_COORDINATES]: 1,
    [RowDeleteReason.INVALID_DEPTH_INTERVAL]: 1,
    [RowDeleteReason.MINIMUM_DATA_REQUIREMENT]: 1,
    [RowDeleteReason.DUPLICATE_ROW]: 1,
    [RowDeleteReason.USER_DELETION]: 1,
  },
  cell_deletions: {
    [CellDeleteReason.NON_NUMERIC]: 3,
    [CellDeleteReason.NEGATIVE_VALUE]: 3,
    [CellDeleteReason.ZERO_VALUE]: 2,
    [CellDeleteReason.DUPLICATE_CELL]: 2,
    [CellDeleteReason.OOB]: 2,
  },
};

describe('PreviewStepSummary', () => {
  describe('InfoCards', () => {
    it('renders the values_modified count', () => {
      render(<PreviewStepSummary removedByUser={3} soilDataSummary={baseSoilDataSummary} isLoading={false} />);
      expect(screen.getByText('30')).toBeInTheDocument();
    });

    it('renders the rows_deleted count', () => {
      render(<PreviewStepSummary removedByUser={3} soilDataSummary={baseSoilDataSummary} isLoading={false} />);
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('renders the cells_deleted count', () => {
      render(<PreviewStepSummary removedByUser={3} soilDataSummary={baseSoilDataSummary} isLoading={false} />);
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    it('renders removedByUser in the rows_deleted card', () => {
      render(<PreviewStepSummary removedByUser={7} soilDataSummary={baseSoilDataSummary} isLoading={false} />);
      expect(screen.getByText('7')).toBeInTheDocument();
    });

    it('renders three InfoCards', () => {
      render(<PreviewStepSummary removedByUser={0} soilDataSummary={baseSoilDataSummary} isLoading={false} />);
      expect(screen.getAllByTestId('sh-ui-infocard')).toHaveLength(3);
    });
  });

  describe('Accordions', () => {
    it('renders three accordions', () => {
      render(<PreviewStepSummary removedByUser={0} soilDataSummary={baseSoilDataSummary} isLoading={false} />);
      expect(screen.getAllByTestId('preview-summary-accordion')).toHaveLength(3);
    });

    it('passes values_modified as total to the first accordion', () => {
      render(<PreviewStepSummary removedByUser={0} soilDataSummary={baseSoilDataSummary} isLoading={false} />);
      const accordions = screen.getAllByTestId('preview-summary-accordion');
      expect(accordions[0]).toHaveAttribute('data-total', '30');
    });

    it('passes rows_deleted + removedByUser as total to the second accordion', () => {
      render(<PreviewStepSummary removedByUser={4} soilDataSummary={baseSoilDataSummary} isLoading={false} />);
      const accordions = screen.getAllByTestId('preview-summary-accordion');
      expect(accordions[1]).toHaveAttribute('data-total', '9');
    });

    it('passes cells_deleted as total to the third accordion', () => {
      render(<PreviewStepSummary removedByUser={0} soilDataSummary={baseSoilDataSummary} isLoading={false} />);
      const accordions = screen.getAllByTestId('preview-summary-accordion');
      expect(accordions[2]).toHaveAttribute('data-total', '12');
    });

    it('sets isLast only on the last accordion', () => {
      render(<PreviewStepSummary removedByUser={0} soilDataSummary={baseSoilDataSummary} isLoading={false} />);
      const accordions = screen.getAllByTestId('preview-summary-accordion');
      expect(accordions[0]).toHaveAttribute('data-is-last', 'false');
      expect(accordions[1]).toHaveAttribute('data-is-last', 'false');
      expect(accordions[2]).toHaveAttribute('data-is-last', 'true');
    });
  });

  it('matches snapshot', () => {
    const { container } = render(<PreviewStepSummary removedByUser={3} soilDataSummary={baseSoilDataSummary} isLoading={false} />);
    expect(container).toMatchSnapshot();
  });
});
