// Mock Editor and Button at the top
jest.mock('primereact/editor', () => ({
  __esModule: true,
  Editor: ({ value, onTextChange, ...props }: any) => (
    <textarea data-testid="editor" value={value} onChange={e => onTextChange && onTextChange({ htmlValue: e.target.value })} {...props} />
  ),
}));
jest.mock('../../../src/components/UI', () => ({
  __esModule: true,
  Button: ({ onClick, children }: any) => <button onClick={onClick}>{children}</button>,
}));

// Mock useTranslation to return predictable text
jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import { render, fireEvent } from '@testing-library/react';
import useTheme from 'hooks/useTheme';
import { TermsAndConditions } from '../../../src/pages/AdminPortal/TermsAndConditions/TermsAndConditions';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('TermsAndConditions page', () => {
  it('matches snapshot', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { termsAndConditionsHtml: 'mock' },
    });
    const { container } = render(<TermsAndConditions />);
    expect(container).toMatchSnapshot();
  });

  it('renders Skeleton when loading', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: true,
      themeConfig: { termsAndConditionsHtml: 'mock' },
    });
    const { container } = render(<TermsAndConditions />);
    expect(container.querySelector('.react-loading-skeleton')).toBeTruthy();
  });

  it('updates html state when Editor changes', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { termsAndConditionsHtml: 'initial' },
    });
    const { getByTestId } = render(<TermsAndConditions />);
    const editor = getByTestId('editor') as HTMLTextAreaElement;
    expect(editor.value).toBe('initial');
    fireEvent.change(editor, { target: { value: 'changed' } });
    expect(editor.value).toBe('changed');
  });

  it('calls saveTermsAndConditions with updated html', () => {
    const saveTermsAndConditions = jest.fn();
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { termsAndConditionsHtml: 'initial' },
      saveTermsAndConditions,
    });
    const { getByTestId, getByText } = render(<TermsAndConditions />);
    const editor = getByTestId('editor') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'changed' } });
    const saveButton = getByText('terms_and_conditions.save');
    fireEvent.click(saveButton);
    expect(saveTermsAndConditions).toHaveBeenCalledWith('changed');
  });
});
