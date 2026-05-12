import { render, screen } from '@testing-library/react';
import { ProgressBar } from 'components/UI/ProgressBar/ProgressBar';

describe('ProgressBar', () => {
  it('returns null when progress is empty', () => {
    const { container } = render(<ProgressBar progress={[]} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders progress bar fill with average width', () => {
    render(<ProgressBar progress={[25, 50, 75]} />);

    expect(screen.getByTestId('sh-ui-progressbar')).toBeInTheDocument();
    expect(screen.getByTestId('sh-ui-progressbar-fill')).toHaveStyle({
      width: '50%',
    });
  });

  it('handles single value', () => {
    render(<ProgressBar progress={[73]} />);

    expect(screen.getByTestId('sh-ui-progressbar-fill')).toHaveStyle({
      width: '73%',
    });
  });

  it('updates when progress changes', () => {
    const { rerender } = render(<ProgressBar progress={[10, 20]} />);

    expect(screen.getByTestId('sh-ui-progressbar-fill')).toHaveStyle({
      width: '15%',
    });

    rerender(<ProgressBar progress={[80, 100]} />);

    expect(screen.getByTestId('sh-ui-progressbar-fill')).toHaveStyle({
      width: '90%',
    });
  });
});
