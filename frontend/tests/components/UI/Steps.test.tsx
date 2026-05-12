import { render } from '@testing-library/react';
import { Steps } from 'components/UI/Steps/Steps';

describe('Steps', () => {
  it('renders matches snapshot', () => {
    const steps = [
      { title: 'Step 1', description: 'Step 1 description' },
      { title: 'Step 2', description: 'Step 2 description' },
      { title: 'Step 3', description: 'Step 3 description' },
    ];
    const { container } = render(<Steps steps={steps} currentIndex={1} />);
    expect(container).toMatchSnapshot();
    const allSteps = container.querySelectorAll('.Step');
    expect(allSteps.length).toBe(3);
    expect(allSteps[0].classList.contains('Visited')).toBeTruthy();
    expect(allSteps[1].classList.contains('Visited')).toBeTruthy();
    expect(allSteps[2].classList.contains('Visited')).toBeFalsy();
  });
});
