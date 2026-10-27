# Shared upload size limit across /files and /frontend/logo

> **Amended (ADR 0067):** the default rose to 5000 MB for Raster Filter sources, which voids the
> "500MB poses no real risk" premise below: `logoUpload` reads the whole file into memory. Multer
> stays shared, and `logoUpload` now enforces its own 5 MB cap before reading the file back.

`MAX_UPLOAD_SIZE_MB` governs multer's `fileSize` limit for every multipart upload, including
`POST /frontend/logo`, not just `POST /files`. `express-openapi-validator`'s `fileUploader` option
wires a single multer instance for the whole app (see `middlewares/openapi.ts`); giving the logo
route its own smaller cap would mean dropping that built-in wiring and hand-rolling multer per
route. We chose the simpler single-limit trade-off since logo files are user-error-bounded (an SVG
or PNG picked from disk) rather than adversarial, and a 500MB default poses no real risk there.
Revisit if the logo route ever needs its own, tighter cap.
