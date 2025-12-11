import { render } from '@testing-library/react';
import Homepage from '../src/pages/Homepage';

jest.mock('components/SoilhiveMap', () => {
  // Define the mock component with a name
  const MockSoilhiveMap = () => <div>Mock SoilhiveMap</div>;

  // The component name is inferred from the function name
  return MockSoilhiveMap;
});
jest.mock('../src/utilities/environmentVariables', () => ({
  MAPBOX_ACCESS_TOKEN: 'mock_access_token',
}));
jest.mock('react-router', () => ({
  Link: ({ to, children }: any) => <a href={to}>{children}</a>,
}));
jest.mock('hooks/useDevice');

test('Renders the home', () => {
  const { container } = render(<Homepage />);
  expect(container).toMatchSnapshot();
});
