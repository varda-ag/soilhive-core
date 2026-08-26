import { describe, it, expect, afterEach } from '@jest/globals';
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { uploadSizeLimit } from '../../src/middlewares/uploadSizeLimit';

const originalMaxUploadSizeMB = process.env.MAX_UPLOAD_SIZE_MB;

const makeReq = (headers: Record<string, string>): Request => ({ headers, originalUrl: '/files' }) as unknown as Request;

const makeRes = (): Response => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.type = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
};

describe('uploadSizeLimit middleware', () => {
  afterEach(() => {
    if (originalMaxUploadSizeMB === undefined) {
      delete process.env.MAX_UPLOAD_SIZE_MB;
    } else {
      process.env.MAX_UPLOAD_SIZE_MB = originalMaxUploadSizeMB;
    }
  });

  it('calls next() when the multipart Content-Length is under the limit', () => {
    process.env.MAX_UPLOAD_SIZE_MB = '1';
    const req = makeReq({ 'content-type': 'multipart/form-data; boundary=xyz', 'content-length': String(1024) });
    const res = makeRes();
    const next = jest.fn();

    uploadSizeLimit(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds 413 with a problem-details body when the multipart Content-Length exceeds the limit', () => {
    process.env.MAX_UPLOAD_SIZE_MB = '1';
    const oversized = 2 * 1024 * 1024;
    const req = makeReq({ 'content-type': 'multipart/form-data; boundary=xyz', 'content-length': String(oversized) });
    const res = makeRes();
    const next = jest.fn();

    uploadSizeLimit(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(StatusCodes.REQUEST_TOO_LONG);
    expect(res.type).toHaveBeenCalledWith('application/problem+json');
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: StatusCodes.REQUEST_TOO_LONG,
        instance: '/files',
      }),
    );
  });

  it('does not reject a non-multipart request even with a large Content-Length', () => {
    process.env.MAX_UPLOAD_SIZE_MB = '1';
    const oversized = 2 * 1024 * 1024;
    const req = makeReq({ 'content-type': 'application/json', 'content-length': String(oversized) });
    const res = makeRes();
    const next = jest.fn();

    uploadSizeLimit(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });
});
