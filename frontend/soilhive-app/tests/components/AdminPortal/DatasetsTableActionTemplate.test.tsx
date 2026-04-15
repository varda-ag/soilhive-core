import { render, screen, fireEvent } from '@testing-library/react';
import { DatasetsTableActionTemplate } from 'components/AdminPortal/DatasetsPublicationTable/DatasetsTableActionTemplate/DatasetsTableActionTemplate';
import { IngestionStatus } from 'types/backend';

jest.mock('components/UI', () => ({
  Button: ({ children, onClick }: any) => (
    <button data-testid="btn-publish" onClick={onClick}>
      {children}
    </button>
  ),
}));

const baseProps = {
  onEdit: jest.fn(),
  onDelete: jest.fn(),
  onPublish: jest.fn(),
};

describe('DatasetsTableActionTemplate', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('PENDING status', () => {
    const dataset = { id: '1', name: 'Dataset', status: IngestionStatus.PENDING };

    it('renders edit and delete icons, no publish button', () => {
      render(<DatasetsTableActionTemplate {...baseProps} dataset={dataset} />);

      expect(screen.queryByTestId('btn-publish')).not.toBeInTheDocument();
      expect(screen.getByTestId('sh-dataset-edit')).toBeInTheDocument();
      expect(screen.getByTestId('sh-dataset-delete')).toBeInTheDocument();
    });

    it('calls onEdit with dataset id when edit icon is clicked', () => {
      render(<DatasetsTableActionTemplate {...baseProps} dataset={dataset} />);

      fireEvent.click(screen.getByTestId('sh-dataset-edit'));
      expect(baseProps.onEdit).toHaveBeenCalledWith('1');
    });

    it('calls onDelete with dataset when delete icon is clicked', () => {
      render(<DatasetsTableActionTemplate {...baseProps} dataset={dataset} />);

      fireEvent.click(screen.getByTestId('sh-dataset-delete'));
      expect(baseProps.onDelete).toHaveBeenCalledWith(dataset);
    });
  });

  describe('LOADED status', () => {
    const dataset = { id: '2', name: 'Dataset', status: IngestionStatus.LOADED };

    it('renders publish button and delete icon, no edit icon', () => {
      render(<DatasetsTableActionTemplate {...baseProps} dataset={dataset} />);

      expect(screen.getByTestId('btn-publish')).toBeInTheDocument();
      expect(screen.queryByTestId('sh-dataset-edit')).not.toBeInTheDocument();
      expect(screen.getByTestId('sh-dataset-delete')).toBeInTheDocument();
    });

    it('calls onPublish with dataset id when publish button is clicked', () => {
      render(<DatasetsTableActionTemplate {...baseProps} dataset={dataset} />);

      fireEvent.click(screen.getByTestId('btn-publish'));
      expect(baseProps.onPublish).toHaveBeenCalledWith('2');
    });

    it('calls onDelete with dataset when delete icon is clicked', () => {
      render(<DatasetsTableActionTemplate {...baseProps} dataset={dataset} />);

      fireEvent.click(screen.getByTestId('sh-dataset-delete'));
      expect(baseProps.onDelete).toHaveBeenCalledWith(dataset);
    });
  });

  describe('PUBLISHED status', () => {
    const dataset = { id: '3', name: 'Dataset', status: IngestionStatus.PUBLISHED };

    it('renders edit and delete icons, no publish button', () => {
      render(<DatasetsTableActionTemplate {...baseProps} dataset={dataset} />);

      expect(screen.queryByTestId('btn-publish')).not.toBeInTheDocument();
      expect(screen.getByTestId('sh-dataset-edit')).toBeInTheDocument();
      expect(screen.getByTestId('sh-dataset-delete')).toBeInTheDocument();
    });

    it('calls onEdit with dataset id when edit icon is clicked', () => {
      render(<DatasetsTableActionTemplate {...baseProps} dataset={dataset} />);

      fireEvent.click(screen.getByTestId('sh-dataset-edit'));
      expect(baseProps.onEdit).toHaveBeenCalledWith('3');
    });
  });

  describe('ONGOING status', () => {
    const dataset = { id: '4', name: 'Dataset', status: IngestionStatus.ONGOING };

    it('renders no action buttons', () => {
      render(<DatasetsTableActionTemplate {...baseProps} dataset={dataset} />);

      expect(screen.queryByTestId('btn-publish')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sh-dataset-edit')).not.toBeInTheDocument();
      expect(screen.queryByTestId('sh-dataset-delete')).not.toBeInTheDocument();
    });
  });
});
