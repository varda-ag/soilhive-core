import { render, screen } from '@testing-library/react';
import { Steps } from 'components/UI/Steps/Steps';

const steps = [
  { title: 'Step 1', description: 'Description 1' },
  { title: 'Step 2', description: 'Description 2' },
  { title: 'Step 3', description: 'Description 3' },
];

describe('Steps', () => {
  it('renders all steps', () => {
    const { container } = render(<Steps steps={steps} currentIndex={0} />);
    expect(container.querySelectorAll('.Step')).toHaveLength(3);
    expect(container).toMatchSnapshot();
  });

  it('renders title and description for each step', () => {
    render(<Steps steps={steps} currentIndex={0} />);
    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Description 1')).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
    expect(screen.getByText('Step 3')).toBeInTheDocument();
  });

  it('marks steps up to and including currentIndex as Visited', () => {
    const { container } = render(<Steps steps={steps} currentIndex={1} />);
    const allSteps = container.querySelectorAll('.Step');
    expect(allSteps[0]).toHaveClass('Visited');
    expect(allSteps[1]).toHaveClass('Visited');
    expect(allSteps[2]).not.toHaveClass('Visited');
  });

  it('marks only the first step as Visited when currentIndex is 0', () => {
    const { container } = render(<Steps steps={steps} currentIndex={0} />);
    const allSteps = container.querySelectorAll('.Step');
    expect(allSteps[0]).toHaveClass('Visited');
    expect(allSteps[1]).not.toHaveClass('Visited');
    expect(allSteps[2]).not.toHaveClass('Visited');
  });

  it('marks all steps as Visited when currentIndex is last', () => {
    const { container } = render(<Steps steps={steps} currentIndex={2} />);
    const allSteps = container.querySelectorAll('.Step');
    allSteps.forEach(step => expect(step).toHaveClass('Visited'));
  });

  describe('showCompletedIcon', () => {
    it('shows check icon for completed steps and number for current', () => {
      const { container } = render(<Steps steps={steps} currentIndex={1} showCompletedIcon={true} />);
      const indices = container.querySelectorAll('.Index');
      expect(indices[0].querySelector('svg')).toBeInTheDocument();
      expect(indices[1].textContent).toBe('2');
      expect(indices[2].textContent).toBe('3');
    });

    it('shows numbers for all steps when showCompletedIcon is false', () => {
      const { container } = render(<Steps steps={steps} currentIndex={1} showCompletedIcon={false} />);
      const indices = container.querySelectorAll('.Index');
      expect(indices[0].querySelector('svg')).not.toBeInTheDocument();
      expect(indices[0].textContent).toBe('1');
      expect(indices[1].textContent).toBe('2');
    });
  });

  describe('orientation', () => {
    it('does not apply Horizontal class by default (vertical)', () => {
      const { container } = render(<Steps steps={steps} currentIndex={0} />);
      container.querySelectorAll('.Step').forEach(step => {
        expect(step).not.toHaveClass('Horizontal');
      });
    });

    it('applies Horizontal class when orientation is horizontal', () => {
      const { container } = render(<Steps steps={steps} currentIndex={0} orientation="horizontal" />);
      container.querySelectorAll('.Step').forEach(step => {
        expect(step).toHaveClass('Horizontal');
      });
    });

    it('does not apply Horizontal class when orientation is vertical', () => {
      const { container } = render(<Steps steps={steps} currentIndex={0} orientation="vertical" />);
      container.querySelectorAll('.Step').forEach(step => {
        expect(step).not.toHaveClass('Horizontal');
      });
    });
  });

  it('applies custom className to the root element', () => {
    const { container } = render(<Steps steps={steps} currentIndex={0} className="custom-class" />);
    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('renders nothing when steps is empty', () => {
    const { container } = render(<Steps steps={[]} currentIndex={0} />);
    expect(container.querySelectorAll('.Step')).toHaveLength(0);
  });
});
