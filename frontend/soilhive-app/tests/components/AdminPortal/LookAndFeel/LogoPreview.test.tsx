import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LogoPreview } from 'components/AdminPortal/LookAndFeel/LogoPreview/LogoPreview';

jest.mock('components/UI', () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => <button onClick={onClick}>{children}</button>,
  FormMessage: ({ message, type }: { message: string; type: string }) => (
    <div data-testid="form-message">
      {type}:{message}
    </div>
  ),
}));

describe('LogoPreview', () => {
  const mockOnChange = jest.fn();
  const mockOnDelete = jest.fn();

  const defaultProps = {
    previewLogo: 'preview-logo.png',
    isActualLogo: false,
    onChange: mockOnChange,
    onDelete: mockOnDelete,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders actual logo title when isActualLogo is true', () => {
    render(<LogoPreview {...defaultProps} isActualLogo />);

    expect(screen.getByText('Actual logo')).toBeInTheDocument();
    expect(screen.getByRole('img')).toHaveAttribute('src', 'preview-logo.png');
    expect(screen.getByRole('img')).toHaveAttribute('alt', 'Logo preview');
  });

  it('renders preview title when isActualLogo is false', () => {
    render(<LogoPreview {...defaultProps} />);

    expect(screen.getByText('Logo preview')).toBeInTheDocument();
  });

  it('calls onChange when change button is clicked', () => {
    render(<LogoPreview {...defaultProps} />);

    fireEvent.click(screen.getByText('Change picture'));

    expect(mockOnChange).toHaveBeenCalledTimes(1);
  });

  it('calls onDelete when delete button is clicked', () => {
    render(<LogoPreview {...defaultProps} />);

    fireEvent.click(screen.getByText('Delete picture'));

    expect(mockOnDelete).toHaveBeenCalledTimes(1);
  });

  it('renders error message when errorMessage is provided', () => {
    render(<LogoPreview {...defaultProps} errorMessage="Upload failed" />);

    expect(screen.getByTestId('form-message')).toHaveTextContent('error:Upload failed');
  });

  it('does not render error message when errorMessage is not provided', () => {
    render(<LogoPreview {...defaultProps} />);

    expect(screen.queryByTestId('form-message')).not.toBeInTheDocument();
  });
});
