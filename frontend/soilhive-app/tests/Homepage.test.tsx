import { render, screen } from '@testing-library/react';
import Homepage from '../src/pages/Homepage';

test('Renders the home', () => {
  render(<Homepage />);
  expect(screen).toMatchSnapshot();
});