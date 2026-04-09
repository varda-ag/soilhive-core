import { render, screen } from '@testing-library/react';
import { ColorsSettings } from 'components/AdminPortal/LookAndFeel/ColorsSettings/ColorsSettings';
import { colorsSettingsConfig } from '../../../../src/configuration/colors';

jest.mock('components/AdminPortal/LookAndFeel/ColorsSettingsSection/ColorsSettingsSection', () => ({
  ColorsSettingsSection: ({ name, applyPrimary, applySecondary }: any) => (
    <div data-testid={`section-${name}`} data-apply-primary={String(!!applyPrimary)} data-apply-secondary={String(!!applySecondary)} />
  ),
}));

describe('ColorsSettings', () => {
  it('renders a section for every entry in colorsSettingsConfig', () => {
    render(<ColorsSettings />);

    colorsSettingsConfig.forEach(section => {
      expect(screen.getByTestId(`section-${section.name}`)).toBeInTheDocument();
    });
  });

  it('renders the correct number of sections', () => {
    render(<ColorsSettings />);

    expect(screen.getAllByTestId(/^section-/)).toHaveLength(colorsSettingsConfig.length);
  });

  it('passes applyPrimary and applySecondary correctly to each section', () => {
    render(<ColorsSettings />);

    colorsSettingsConfig.forEach(section => {
      const el = screen.getByTestId(`section-${section.name}`);
      expect(el).toHaveAttribute('data-apply-primary', String(!!section.applyPrimary));
      expect(el).toHaveAttribute('data-apply-secondary', String(!!section.applySecondary));
    });
  });

  it('matches snapshot', () => {
    const { container } = render(<ColorsSettings />);
    expect(container).toMatchSnapshot();
  });
});
