import React from 'react';
import { useLocation, useNavigate } from 'react-router';
import { render, screen, fireEvent } from '@testing-library/react';
import { LookAndFeelTabs } from 'components/AdminPortal/LookAndFeel/LookAndFeelTabs/LookAndFeelTabs';
import { ADMIN_PATHS } from '../../../../src/configuration/admin';
import useLookAndFeel from 'hooks/useLookAndFeel';

jest.mock('hooks/useLookAndFeel', jest.fn);

jest.mock('react-router', () => ({
  useLocation: jest.fn(),
  useNavigate: jest.fn(),
}));

jest.mock('components/AdminPortal/AdminPageTabs/AdminPageTabs', () => ({
  AdminPageTabs: (props: any) => {
    return (
      <div data-testid="admin-page-tabs">
        <button data-testid="tabs-onchange-trigger" onClick={() => props.onChange(ADMIN_PATHS.LOOK_AND_FEEL_COLORS)}>
          trigger tab change
        </button>
        <div data-testid="tabs-active-tab">{props.activeTab}</div>
        <div data-testid="tabs-values">
          {props.tabsData.map((tab: any) => (
            <div key={tab.value}>
              {tab.value}:{tab.label}
            </div>
          ))}
        </div>
        <div data-testid="tabs-children">{props.children}</div>
      </div>
    );
  },
}));

jest.mock('components/UI', () => ({
  Button: ({
    children,
    'data-testid': dataTestId,
    onClick,
  }: {
    children: React.ReactNode;
    'data-testid': string;
    onClick?: () => void;
  }) => (
    <button data-testid={dataTestId} onClick={onClick}>
      {children}
    </button>
  ),
}));

jest.mock('../../../../src/configuration/admin', () => ({
  ADMIN_PATHS: {
    LOOK_AND_FEEL_LOGO: '/adminportal/look-and-feel/logo',
    LOOK_AND_FEEL_COLORS: '/adminportal/look-and-feel/colors',
  },
}));

describe('LookAndFeelTabs', () => {
  const mockNavigate = jest.fn();
  const mockSaveChanges = jest.fn();
  const mockResetChanges = jest.fn();

  beforeEach(() => {
    (useLookAndFeel as jest.Mock).mockReturnValue({
      saveChanges: mockSaveChanges,
      resetChanges: mockResetChanges,
    });

    (useLocation as jest.Mock).mockReturnValue({
      pathname: ADMIN_PATHS.LOOK_AND_FEEL_LOGO,
    });
    (useNavigate as jest.Mock).mockReturnValue(mockNavigate);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders LookAndFeelTabs and matches snapshot', () => {
    const { container } = render(<LookAndFeelTabs />);

    expect(screen.getByTestId('admin-page-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('tabs-active-tab')).toHaveTextContent(ADMIN_PATHS.LOOK_AND_FEEL_LOGO);
    expect(screen.getByTestId('sh-lookandfeel-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('sh-lookandfeel-publish')).toBeInTheDocument();

    expect(container).toMatchSnapshot();
  });

  it('passes navigate as onChange and calls it when tab changes', () => {
    render(<LookAndFeelTabs />);

    fireEvent.click(screen.getByTestId('tabs-onchange-trigger'));

    expect(mockNavigate).toHaveBeenCalledWith(ADMIN_PATHS.LOOK_AND_FEEL_COLORS);
  });

  it('calls saveChanges on publish button click', () => {
    render(<LookAndFeelTabs />);

    fireEvent.click(screen.getByTestId('sh-lookandfeel-publish'));

    expect(mockSaveChanges).toHaveBeenCalled();
  });

  it('calls resetChanges on cancel button click', () => {
    render(<LookAndFeelTabs />);

    fireEvent.click(screen.getByTestId('sh-lookandfeel-cancel'));

    expect(mockResetChanges).toHaveBeenCalled();
  });
});
