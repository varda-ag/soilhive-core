import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewSummaryAccordion } from '../../../../src/pages/AdminPortal/DatasetsPreviewStep/PreviewStepSummary/PreviewSummaryAccordion/PreviewSummaryAccordion';

const baseConfig = {
  color: '#A2D141',
  title: 'Values Modified',
  total: 42,
  items: [
    { label: 'Depth rounded', value: 10 },
    { label: 'Value rounded', value: 20 },
    { label: 'Unit converted', value: 12 },
  ],
};

describe('PreviewSummaryAccordion', () => {
  describe('rendering', () => {
    it('renders the accordion title', () => {
      render(<PreviewSummaryAccordion config={baseConfig} />);
      expect(screen.getByText('Values Modified')).toBeInTheDocument();
    });

    it('renders all item labels', () => {
      render(<PreviewSummaryAccordion config={baseConfig} />);
      expect(screen.getByText('Depth rounded')).toBeInTheDocument();
      expect(screen.getByText('Value rounded')).toBeInTheDocument();
      expect(screen.getByText('Unit converted')).toBeInTheDocument();
    });

    it('renders all item values', () => {
      render(<PreviewSummaryAccordion config={baseConfig} />);
      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('20')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    it('renders items in order', () => {
      render(<PreviewSummaryAccordion config={baseConfig} />);
      const labels = screen.getAllByRole('paragraph').map(el => el.textContent);
      const depthIndex = labels.indexOf('Depth rounded');
      const valueIndex = labels.indexOf('Value rounded');
      const unitIndex = labels.indexOf('Unit converted');
      expect(depthIndex).toBeLessThan(valueIndex);
      expect(valueIndex).toBeLessThan(unitIndex);
    });
  });

  describe('isLast prop', () => {
    it('applies the Last CSS class to the header when isLast is true', () => {
      const { container } = render(<PreviewSummaryAccordion config={baseConfig} isLast />);
      expect(container.querySelector('.AccordionHeader')).toHaveClass('Last');
    });

    it('does not apply the Last CSS class when isLast is omitted', () => {
      const { container } = render(<PreviewSummaryAccordion config={baseConfig} />);
      expect(container.querySelector('.AccordionHeader')).not.toHaveClass('Last');
    });
  });

  describe('accordion toggle', () => {
    it('is closed by default', () => {
      render(<PreviewSummaryAccordion config={baseConfig} />);
      expect(screen.getByTestId('sh-ui-accordion')).not.toHaveClass('Opened');
    });

    it('opens on header click and shows items', () => {
      render(<PreviewSummaryAccordion config={baseConfig} />);
      fireEvent.click(screen.getByTestId('sh-ui-accordion').querySelector('.Header')!);
      expect(screen.getByTestId('sh-ui-accordion')).toHaveClass('Opened');
    });
  });

  it('matches snapshot', () => {
    const { container } = render(<PreviewSummaryAccordion config={baseConfig} />);
    expect(container).toMatchSnapshot();
  });

  it('matches snapshot with isLast', () => {
    const { container } = render(<PreviewSummaryAccordion config={baseConfig} isLast />);
    expect(container).toMatchSnapshot();
  });
});
