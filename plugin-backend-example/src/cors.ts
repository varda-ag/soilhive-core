import type { RequestHandler } from 'express';

// Mounted first, so every response carries these headers, a 401 or an error included. Without them
// the browser hides the status, and the host sees a failed call instead of the 401 that makes it
// get a new Plugin token. A reverse proxy in front of this backend must add them to its own error
// pages too (nginx: add_header ... always).
export const cors: RequestHandler = (req, res, next) => {
  // Any origin: the token travels in a header and no cookie is honoured, so a page that is not the
  // host has nothing to send
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Expose-Headers', 'Content-Disposition');
  if (req.method === 'OPTIONS') {
    // Answered before any token check: a preflight never carries one, and failing it fails the call
    res.set('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE');
    // Echoed, because '*' does not cover Authorization
    res.set('Access-Control-Allow-Headers', req.get('Access-Control-Request-Headers') || 'Authorization, Content-Type');
    res.set('Access-Control-Max-Age', '7200');
    res.vary('Access-Control-Request-Headers');
    res.status(204).end();
    return;
  }
  next();
};
