import { render } from '@testing-library/react';
import { DatasetsTableVisibilityTemplate } from 'components/AdminPortal/DatasetsPublicationTable/DatasetsTableVisibilityTemplate/DatasetsTableVisibilityTemplate';

describe('DatasetsTableVisibilityTemplate', () => {
  it('renders translated visibility label when visibility is provided', () => {
    const { container } = render(<DatasetsTableVisibilityTemplate visibility="public" />);

    expect(container).toHaveTextContent('Public');
  });

  it('renders "-" when visibility is undefined', () => {
    const { container } = render(<DatasetsTableVisibilityTemplate />);

    expect(container).toHaveTextContent('-');
  });

  it('renders "-" when visibility is empty string', () => {
    const { container } = render(<DatasetsTableVisibilityTemplate visibility="" />);

    expect(container).toHaveTextContent('-');
  });
});
