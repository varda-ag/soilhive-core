import { render, screen } from '@testing-library/react';
import { FilterInstallingPanel } from 'components/AdminPortal/RasterFilterForm/FilterInstallingPanel/FilterInstallingPanel';

describe('FilterInstallingPanel', () => {
  it('renders the title and the description', () => {
    render(<FilterInstallingPanel />);

    expect(screen.getByRole('heading', { name: 'Filter installation in progress' })).toBeInTheDocument();
    expect(screen.getByText(/The system is installing your filter/)).toBeInTheDocument();
  });

  it('renders no button', () => {
    render(<FilterInstallingPanel progress={10} />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders no progress while the install is queued', () => {
    render(<FilterInstallingPanel />);

    expect(screen.queryByTestId('sh-ui-progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText(/%$/)).not.toBeInTheDocument();
  });

  it('renders the progress bar and the rounded percentage', () => {
    render(<FilterInstallingPanel progress={42.6} />);

    expect(screen.getByTestId('sh-ui-progressbar-fill')).toHaveStyle({ width: '42.6%' });
    expect(screen.getByText('43%')).toBeInTheDocument();
  });

  it('renders 0% at the start of the install', () => {
    render(<FilterInstallingPanel progress={0} />);

    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
