import { downloadFile } from '../../src/utilities/download';

describe('downloadFile', () => {
  const originalCreateElement = document.createElement.bind(document);
  let mockLink: {
    href: string;
    download: string;
    click: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(() => {
    mockLink = {
      href: '',
      download: '',
      click: jest.fn(),
      remove: jest.fn(),
    };

    jest.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'a') {
        return mockLink as unknown as HTMLAnchorElement;
      }
      return originalCreateElement(tagName);
    }) as typeof document.createElement);

    jest.spyOn(document.body, 'appendChild').mockReturnValue(mockLink as unknown as Node);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates an anchor element with the correct href', () => {
    downloadFile('https://example.com/file.pdf');

    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mockLink.href).toBe('https://example.com/file.pdf');
  });

  it('sets the download attribute when filename is provided', () => {
    downloadFile('https://example.com/file.pdf', 'my-file.pdf');

    expect(mockLink.download).toBe('my-file.pdf');
  });

  it('does not set the download attribute when filename is omitted', () => {
    downloadFile('https://example.com/file.pdf');

    expect(mockLink.download).toBe('');
  });

  it('appends the link to document.body', () => {
    downloadFile('https://example.com/file.pdf');

    expect(document.body.appendChild).toHaveBeenCalledWith(mockLink);
  });

  it('clicks the link', () => {
    downloadFile('https://example.com/file.pdf');

    expect(mockLink.click).toHaveBeenCalledTimes(1);
  });

  it('removes the link after clicking', () => {
    downloadFile('https://example.com/file.pdf');

    expect(mockLink.remove).toHaveBeenCalledTimes(1);
  });

  it('appends, clicks, then removes in the correct order', () => {
    const callOrder: string[] = [];

    (document.body.appendChild as jest.Mock).mockImplementation(() => {
      callOrder.push('appendChild');
    });
    mockLink.click.mockImplementation(() => {
      callOrder.push('click');
    });
    mockLink.remove.mockImplementation(() => {
      callOrder.push('remove');
    });

    downloadFile('https://example.com/file.pdf', 'report.csv');

    expect(callOrder).toEqual(['appendChild', 'click', 'remove']);
  });
});
