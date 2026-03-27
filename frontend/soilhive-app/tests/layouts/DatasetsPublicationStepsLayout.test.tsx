import { render } from '@testing-library/react';
import { DatasetsPublicationStepsLayout } from '../../src/layouts/DatasetsPublicationStepsLayout/DatasetsPublicationStepsLayout';

jest.mock('react-router', () => ({
  Outlet: () => <div data-testid="outlet" />,
  useLocation: jest.fn().mockReturnValue({ pathname: '/datasets/mock-dataset-id/mappings' }),
}));

describe('DatasetsPublicationStepsLayout', () => {
  it('renders DatasetsPublicationStepsLayout and matches the snapshot', () => {
    const { container } = render(<DatasetsPublicationStepsLayout />);
    expect(container).toMatchSnapshot();
    const allSteps = container.querySelectorAll('.Step');
    expect(allSteps.length).toBe(4);
    // Step 2 is for the mappings
    expect(allSteps[2].classList.contains('Visited')).toBeTruthy();
    expect(allSteps[3].classList.contains('Visited')).toBeFalsy();
  });
});
