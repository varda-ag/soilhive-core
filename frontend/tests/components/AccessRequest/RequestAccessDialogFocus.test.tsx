import { render, screen } from '@testing-library/react';
import { RequestAccessDialog } from 'components/AccessRequest/RequestAccessDialog/RequestAccessDialog';
import useTheme from 'hooks/useTheme';
import { useAuthContext } from '../../../src/auth/AuthContextProvider';

jest.mock('../../../src/auth/AuthContextProvider', () => ({
  useAuthContext: jest.fn(),
}));

jest.mock('hooks/useTheme', () => ({
  __esModule: true,
  default: jest.fn(),
}));

// With the real Dialog and PrimeReact's: they decide where the focus goes when the form opens
describe('RequestAccessDialog focus', () => {
  beforeEach(() => {
    (useAuthContext as jest.Mock).mockReturnValue({ user: { profile: { name: 'Jane Doe', email: 'jane@example.org' } } });
    (useTheme as jest.Mock).mockReturnValue({ themeConfig: {} });
  });

  // Loading: as it opens from the map, while the user's own requests are read
  it.each([true, false])('takes the focus from the Access button on opening, without opening the country list (loading: %p)', isLoading => {
    const accessButton = <button>Access</button>;
    const { rerender } = render(accessButton);
    screen.getByRole('button', { name: 'Access' }).focus();

    rerender(
      <>
        {accessButton}
        <RequestAccessDialog datasetName="Soil Carbon Kenya" isLoading={isLoading} onClose={jest.fn()} onSubmit={jest.fn()} />
      </>,
    );

    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
  });
});
