// Mock Editor and Button at the top
jest.mock('primereact/editor', () => ({
  __esModule: true,
  // Only the props a <textarea> understands are forwarded: headerTemplate is a
  // PrimeReact-only prop holding a React element, and spreading it onto the DOM
  // makes React warn about an unrecognised attribute.
  Editor: ({ value, onTextChange, style }: any) => (
    <textarea
      data-testid="editor"
      value={value}
      style={style}
      onChange={e => onTextChange && onTextChange({ htmlValue: e.target.value })}
    />
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
import { PrivacyPolicy } from '../../../src/pages/AdminPortal/PrivacyPolicy/PrivacyPolicy';

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe('PrivacyPolicy page', () => {
  it('matches snapshot', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { privacyPolicyHtml: 'mock' },
    });
    const { container } = render(<PrivacyPolicy />);
    expect(container).toMatchSnapshot();
  });

  it('renders Skeleton when loading', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: true,
      themeConfig: { privacyPolicyHtml: 'mock' },
    });
    const { container } = render(<PrivacyPolicy />);
    expect(container.querySelector('.react-loading-skeleton')).toBeTruthy();
  });

  it('updates html state when Editor changes', () => {
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { privacyPolicyHtml: 'initial' },
    });
    const { getByTestId } = render(<PrivacyPolicy />);
    const editor = getByTestId('editor') as HTMLTextAreaElement;
    expect(editor.value).toBe('initial');
    fireEvent.change(editor, { target: { value: 'changed' } });
    expect(editor.value).toBe('changed');
  });

  it('calls savePrivacyPolicy with updated html', () => {
    const savePrivacyPolicy = jest.fn();
    (useTheme as jest.Mock).mockReturnValue({
      isLoadingThemeConfig: false,
      themeConfig: { privacyPolicyHtml: 'initial' },
      savePrivacyPolicy,
    });
    const { getByTestId, getByText } = render(<PrivacyPolicy />);
    const editor = getByTestId('editor') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: 'changed' } });
    const saveButton = getByText('privacy_policy.save');
    fireEvent.click(saveButton);
    expect(savePrivacyPolicy).toHaveBeenCalledWith('changed');
  });
});
