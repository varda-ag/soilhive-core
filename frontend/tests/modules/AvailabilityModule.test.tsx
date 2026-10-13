import { MemoryRouter, Route, Routes } from 'react-router';
import { render, screen, waitFor } from '@testing-library/react';
import AvailabilityModule from '../../src/modules/AvailabilityModule';
import { __resetIsMobileDevice, __resetIsMobileLayout, __setIsMobileDevice, __setIsMobileLayout } from 'hooks/useDevice';

jest.mock('hooks/useDevice');

jest.mock('components/PageTitle', () => ({
  __esModule: true,
  default: ({ title }: { title: string }) => <div data-testid="page-title">{title}</div>,
}));

jest.mock('../../src/pages/Availability', () => ({
  __esModule: true,
  default: () => <div>Availability page</div>,
}));

jest.mock('../../src/pages/DownloadPreview', () => ({
  __esModule: true,
  default: () => <div>DownloadPreview page</div>,
}));

jest.mock('../../src/pages/DownloadSummary', () => ({
  __esModule: true,
  default: () => <div>DownloadSummary page</div>,
}));

jest.mock('../../src/contexts/AvailabilityContext', () => ({
  AvailabilityProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const MOBILE_NOTE = { name: 'Best experience on desktop or iPad' };

const availabilityModule = () => (
  <MemoryRouter initialEntries={['/']}>
    <Routes>
      <Route path="/*" element={<AvailabilityModule />} />
    </Routes>
  </MemoryRouter>
);

describe('AvailabilityModule', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    __resetIsMobileDevice();
    __resetIsMobileLayout();
  });

  it('shows the note about missing features on a mobile device', () => {
    __setIsMobileDevice(true);
    render(availabilityModule());

    expect(screen.getByText('Availability page')).toBeInTheDocument();
    expect(screen.getByRole('dialog', MOBILE_NOTE)).toBeInTheDocument();
  });

  it('does not show the note about missing features in a narrow browser on a laptop', () => {
    __setIsMobileLayout(true);
    render(availabilityModule());

    expect(screen.getByText('Availability page')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', MOBILE_NOTE)).not.toBeInTheDocument();
  });

  it('hides the note about missing features when the device is no longer a mobile device', async () => {
    __setIsMobileDevice(true);
    const { rerender } = render(availabilityModule());
    expect(screen.getByRole('dialog', MOBILE_NOTE)).toBeInTheDocument();

    __setIsMobileDevice(false);
    rerender(availabilityModule());

    await waitFor(() => expect(screen.queryByRole('dialog', MOBILE_NOTE)).not.toBeInTheDocument());
  });
});
