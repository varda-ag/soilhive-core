import { createImage, getCroppedFile } from '../../src/utilities/cropper';
import type { CropArea } from 'types/components';

describe('cropper utils - createImage', () => {
  const originalImage = global.Image;
  const originalCreateElement = document.createElement.bind(document);

  afterEach(() => {
    jest.restoreAllMocks();
    global.Image = originalImage;
    document.createElement = originalCreateElement;
  });
  it('resolves with image on load', async () => {
    let imageInstance: any;

    const ImageMock = jest.fn(() => {
      imageInstance = {
        onload: null,
        onerror: null,
        set src(_value: string) {
          setTimeout(() => {
            imageInstance.onload?.();
          }, 0);
        },
      };
      return imageInstance;
    });

    global.Image = ImageMock;

    const promise = createImage('test-url');

    await expect(promise).resolves.toBe(imageInstance);
    expect(ImageMock).toHaveBeenCalled();
  });

  it('rejects on image error', async () => {
    let imageInstance: any;

    const ImageMock = jest.fn(() => {
      imageInstance = {
        onload: null,
        onerror: null,
        set src(_value: string) {
          setTimeout(() => {
            imageInstance.onerror?.(new Error('fail'));
          }, 0);
        },
      };
      return imageInstance;
    });

    global.Image = ImageMock;

    await expect(createImage('bad-url')).rejects.toEqual(new Error('fail'));
  });
});

describe('cropper utils - getCroppedFile', () => {
  const originalImage = global.Image;
  const originalCreateElement = document.createElement.bind(document);

  const crop: CropArea = {
    x: 10,
    y: 20,
    width: 100,
    height: 50,
  };

  function mockLoadedImage() {
    let instance: any;

    const ImageMock = jest.fn(() => {
      instance = {
        onload: null,
        onerror: null,
        width: 500,
        height: 300,
        set src(_value: string) {
          setTimeout(() => {
            instance.onload?.();
          }, 0);
        },
      };
      return instance;
    });

    global.Image = ImageMock;

    return () => instance;
  }

  afterEach(() => {
    jest.restoreAllMocks();
    global.Image = originalImage;
    document.createElement = originalCreateElement;
  });

  it('returns cropped file successfully', async () => {
    const getCreatedImage = mockLoadedImage();

    const drawImage = jest.fn();
    const mockContext = {
      drawImage,
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    };

    const mockBlob = new Blob(['test-image-content'], { type: 'image/png' });
    const toBlob = jest.fn((callback: BlobCallback, _type?: string, _quality?: any) => {
      callback(mockBlob);
    });

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => mockContext),
      toBlob,
    };

    jest.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'canvas') {
        return mockCanvas as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);

    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(123456789);

    const file = await getCroppedFile('image-url', crop, 133, 47, 'logo.png', 'image/png', 0.8);

    expect(mockCanvas.width).toBe(133);
    expect(mockCanvas.height).toBe(47);

    expect(mockCanvas.getContext).toHaveBeenCalledWith('2d');

    expect(mockContext.imageSmoothingEnabled).toBe(true);
    expect(mockContext.imageSmoothingQuality).toBe('high');

    expect(drawImage).toHaveBeenCalledWith(getCreatedImage(), 10, 20, 100, 50, 0, 0, 133, 47);

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png', 0.8);

    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('logo.png');
    expect(file.type).toBe('image/png');
    expect(file.lastModified).toBe(123456789);

    nowSpy.mockRestore();
  });

  it('throws when canvas context is not available', async () => {
    mockLoadedImage();

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => null),
    };

    jest.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'canvas') {
        return mockCanvas as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);

    await expect(getCroppedFile('image-url', crop, 133, 47)).rejects.toThrow('Canvas context is not available');
  });

  it('throws when blob creation fails', async () => {
    mockLoadedImage();

    const mockContext = {
      drawImage: jest.fn(),
      imageSmoothingEnabled: false,
      imageSmoothingQuality: 'low',
    };

    const mockCanvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => mockContext),
      toBlob: jest.fn((callback: BlobCallback) => {
        callback(null);
      }),
    };

    jest.spyOn(document, 'createElement').mockImplementation(((tagName: string) => {
      if (tagName === 'canvas') {
        return mockCanvas as unknown as HTMLCanvasElement;
      }

      return originalCreateElement(tagName);
    }) as typeof document.createElement);

    await expect(getCroppedFile('image-url', crop, 133, 47)).rejects.toThrow('Failed to create blob');
  });
});
