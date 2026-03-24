import React from 'react';
import { useLocation, useNavigate } from 'react-router';
import { render, screen, fireEvent } from '@testing-library/react';
import { LookAndFeelLayout } from '../../../../src/pages/AdminPortal/LookAndFeel/LookAndFeelLayout';
import { ADMIN_PATHS } from '../../../../src/configuration/admin';

jest.mock('react-router', () => ({
  useLocation: jest.fn(),
  useNavigate: jest.fn(),
  Outlet: () => <div data-testid="outlet" />,
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

describe('LookAndFeelLayout', () => {
  const navigateMock = jest.fn();

  beforeEach(() => {
    (useLocation as jest.Mock).mockReturnValue({
      pathname: ADMIN_PATHS.LOOK_AND_FEEL_LOGO,
    });
    (useNavigate as jest.Mock).mockReturnValue(navigateMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders AdminPageTabs and matches snapshot', () => {
    const { container } = render(<LookAndFeelLayout />);

    expect(screen.getByTestId('admin-page-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('tabs-active-tab')).toHaveTextContent(ADMIN_PATHS.LOOK_AND_FEEL_LOGO);
    expect(screen.getByTestId('sh-lookandfeel-cancel')).toBeInTheDocument();
    expect(screen.getByTestId('sh-lookandfeel-publish')).toBeInTheDocument();
    expect(screen.getByTestId('outlet')).toBeInTheDocument();

    expect(container).toMatchSnapshot();
  });

  it('passes navigate as onChange and calls it when tab changes', () => {
    render(<LookAndFeelLayout />);

    fireEvent.click(screen.getByTestId('tabs-onchange-trigger'));

    expect(navigateMock).toHaveBeenCalledWith(ADMIN_PATHS.LOOK_AND_FEEL_COLORS);
  });
});
