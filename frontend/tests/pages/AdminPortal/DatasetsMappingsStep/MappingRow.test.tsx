import { render, screen, fireEvent } from '@testing-library/react';
import { MappingRow } from 'pages/AdminPortal/DatasetsMappingsStep/MappingRow';
import type { MenuOption } from 'components/UI/types';
import type { ComponentProps } from 'react';

// All SVGs are globally mocked via moduleNameMapper → svgMock.tsx.
// svgMock passes through the className prop, and identity-obj-proxy returns
// each CSS module key as its literal string (e.g. styles.CheckIcon → "CheckIcon").
// We query by className to distinguish which icon is rendered.

// AutocompleteDropdown wraps PrimeReact's AutoComplete — stub it so these tests
// stay focused on MappingRow logic and don't pull in PrimeReact internals.
jest.mock('components/AutocompleteDropdown/AutocompleteDropdown', () => {
  const Mock = ({ isDisabled }: { isDisabled?: boolean }) => (
    <div data-testid="sh-autocomplete-dropdown" aria-disabled={isDisabled ?? false} />
  );
  Mock.displayName = 'AutocompleteDropdown';
  return { AutocompleteDropdown: Mock };
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const conceptOptions: MenuOption[] = [{ code: 'ph', name: 'pH' }];
const unitOptions: MenuOption[] = [{ code: 'percent', name: '%' }];

function defaultProps(overrides?: Partial<ComponentProps<typeof MappingRow>>): ComponentProps<typeof MappingRow> {
  return {
    columnName: 'Carbon_organic',
    isMapped: false,
    conceptOptions,
    unitOptions,
    conceptValue: null,
    unitValue: null,
    isExpanded: false,
    isUnitEnabled: false,
    isDetailsEnabled: true,
    isGeometryDetectedField: false,
    onToggle: jest.fn(),
    onConceptChange: jest.fn(),
    onUnitChange: jest.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MappingRow', () => {
  describe('column name', () => {
    it('renders the detected column name', () => {
      render(<MappingRow {...defaultProps()} />);
      expect(screen.getByText('Carbon_organic')).toBeInTheDocument();
    });

    it('sets the full column name as the title attribute for a hover tooltip', () => {
      render(<MappingRow {...defaultProps({ columnName: 'Carbon_organic_content_percent_0_30cm' })} />);
      expect(screen.getByText('Carbon_organic_content_percent_0_30cm')).toHaveAttribute('title', 'Carbon_organic_content_percent_0_30cm');
    });
  });

  describe('status icon', () => {
    it('shows the warning icon when isMapped is false', () => {
      const { container } = render(<MappingRow {...defaultProps({ isMapped: false })} />);
      expect(container.querySelector('.WarningIcon')).toBeInTheDocument();
      expect(container.querySelector('.CheckIcon')).not.toBeInTheDocument();
    });

    it('shows the check icon when isMapped is true', () => {
      const { container } = render(<MappingRow {...defaultProps({ isMapped: true })} />);
      expect(container.querySelector('.CheckIcon')).toBeInTheDocument();
      expect(container.querySelector('.WarningIcon')).not.toBeInTheDocument();
    });
  });

  describe('expand / collapse', () => {
    it('calls onToggle with the column name when the chevron is clicked', () => {
      const props = defaultProps();
      render(<MappingRow {...props} />);
      fireEvent.click(screen.getByRole('button'));
      expect(props.onToggle).toHaveBeenCalledWith('Carbon_organic');
    });

    it('does not render detailsContent when isExpanded is false', () => {
      render(<MappingRow {...defaultProps({ detailsContent: <div data-testid="sh-mapping-row-details" /> })} />);
      expect(screen.queryByTestId('sh-mapping-row-details')).not.toBeInTheDocument();
    });

    it('renders detailsContent when isExpanded and isDetailsEnabled are both true', () => {
      render(<MappingRow {...defaultProps({ isExpanded: true, detailsContent: <div data-testid="sh-mapping-row-details" /> })} />);
      expect(screen.getByTestId('sh-mapping-row-details')).toBeInTheDocument();
    });

    it('does not render detailsContent when isDetailsEnabled is false even if isExpanded is true', () => {
      render(
        <MappingRow
          {...defaultProps({
            isExpanded: true,
            isDetailsEnabled: false,
            detailsContent: <div data-testid="sh-mapping-row-details" />,
          })}
        />,
      );
      expect(screen.queryByTestId('sh-mapping-row-details')).not.toBeInTheDocument();
    });
  });

  describe('unit dropdown disabled state', () => {
    it('disables the unit dropdown when isUnitEnabled is false', () => {
      render(<MappingRow {...defaultProps({ isUnitEnabled: false })} />);
      expect(screen.getByTestId('sh-ui-dropdown')).toHaveClass('Disabled');
    });

    it('enables the unit dropdown when isUnitEnabled is true', () => {
      render(<MappingRow {...defaultProps({ isUnitEnabled: true })} />);
      expect(screen.getByTestId('sh-ui-dropdown')).not.toHaveClass('Disabled');
    });
  });

  describe('concept dropdown disabled state', () => {
    it('disables the concept dropdown when isGeometryDetectedField is true', () => {
      render(<MappingRow {...defaultProps({ isGeometryDetectedField: true })} />);
      expect(screen.getByTestId('sh-autocomplete-dropdown')).toHaveAttribute('aria-disabled', 'true');
    });

    it('leaves the concept dropdown enabled when isGeometryDetectedField is false', () => {
      render(<MappingRow {...defaultProps({ isGeometryDetectedField: false })} />);
      expect(screen.getByTestId('sh-autocomplete-dropdown')).toHaveAttribute('aria-disabled', 'false');
    });
  });

  describe('extraCell slot', () => {
    it('does not render an extra cell by default (e.g. the default variant)', () => {
      render(<MappingRow {...defaultProps()} />);
      expect(screen.queryByTestId('sh-extra-cell')).not.toBeInTheDocument();
    });

    it('renders the extraCell when provided (e.g. the raster variant depth inputs)', () => {
      render(<MappingRow {...defaultProps({ extraCell: <div data-testid="sh-extra-cell" /> })} />);
      expect(screen.getByTestId('sh-extra-cell')).toBeInTheDocument();
    });
  });
});
