import { render, screen, fireEvent } from '@testing-library/react';
import { AdminPageTabs } from 'components/AdminPortal/AdminPageTabs/AdminPageTabs';

jest.mock('components/UI', () => ({
  Tabs: (props: any) => {
    return (
      <div data-testid="tabs-mock">
        <button data-testid="tabs-onchange-trigger" onClick={() => props.onChange('colors')}>
          trigger change
        </button>
        <div data-testid="tabs-active-tab">{props.activeTab}</div>
        <div data-testid="tabs-data">
          {props.tabsData.map((tab: any) => (
            <div key={tab.value}>
              {tab.value}:{tab.label}
            </div>
          ))}
        </div>
      </div>
    );
  },
}));

describe('AdminPageTabs', () => {
  const tabsData = [
    { value: 'logo', label: 'Logo' },
    { value: 'colors', label: 'Colors' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders wrapper and matches snapshot', () => {
    const { container } = render(<AdminPageTabs tabsData={tabsData} activeTab="logo" onChange={jest.fn()} />);

    expect(screen.getByTestId('sh-adminpage-tabs')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('renders children inside actions container and matches snapshot', () => {
    const { container } = render(
      <AdminPageTabs tabsData={tabsData} activeTab="logo" onChange={jest.fn()}>
        <button>Cancel</button>
        <button>Publish</button>
      </AdminPageTabs>,
    );

    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('Publish')).toBeInTheDocument();
    expect(container).toMatchSnapshot();
  });

  it('accepts additional className', () => {
    render(<AdminPageTabs tabsData={tabsData} activeTab="logo" onChange={jest.fn()} className="CustomClass" />);

    expect(screen.getByTestId('sh-adminpage-tabs')).toHaveClass('AdminPageTabs');
    expect(screen.getByTestId('sh-adminpage-tabs')).toHaveClass('CustomClass');
  });

  it('uses Tabs onChange handler', () => {
    const onChange = jest.fn();

    render(<AdminPageTabs tabsData={tabsData} activeTab="logo" onChange={onChange} />);

    fireEvent.click(screen.getByTestId('tabs-onchange-trigger'));

    expect(onChange).toHaveBeenCalledWith('colors');
  });
});
