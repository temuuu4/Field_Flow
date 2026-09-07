export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  // Body-parser raises SyntaxError for malformed JSON. The error carries a
  // `.body` so we can distinguish "JSON parse failed" from a generic syntax
  // error elsewhere in the stack.
  if (error instanceof SyntaxError && error.status === 400 && error.body) {
    response.status(400).json({ success: false, message: 'Invalid JSON body' });
    return;
  }

  // body-parser size-limit errors set `.type === 'entity.too.large'` and
  // `.status === 413`. Returning a 413 here gives clients a clear signal
  // rather than bubbling up as a 500.
  if (error.type === 'entity.too.large') {
    response.status(413).json({ success: false, message: 'Request body is too large' });
    return;
  }

  if (error.name === 'ValidationError') {
    const details = Object.values(error.errors).map((validationError) => ({
      field: validationError.path,
      message: validationError.message,
    }));
    response.status(400).json({ success: false, message: 'Validation failed', details });
    return;
  }

  if (error.name === 'CastError') {
    response.status(400).json({ success: false, message: `Invalid ${error.path}` });
    return;
  }

  if (error.code === 11000) {
    const duplicateFields = Object.keys(error.keyPattern ?? error.keyValue ?? {});
    const message = duplicateFields.includes('email')
      ? 'A user with this email already exists'
      : duplicateFields.includes('sampleNumber')
        ? 'A sample with this sample ID already exists'
        : duplicateFields.includes('assignmentId') && duplicateFields.includes('barcodeValue')
          ? 'This barcode has already been collected for this assignment'
      : 'A record with the provided unique value already exists';
    response.status(409).json({ success: false, message });
    return;
  }

  const statusCode = error.statusCode ?? 500;
  if (statusCode >= 500 && process.env.NODE_ENV !== 'production') {
    // Server-side diagnostics stay out of the response body and never leak
    // to the client (see `body` construction below). Logging the full error
    // in development preserves stack traces for debugging.
    console.error(error);
  }

  const body = {
    success: false,
    message: statusCode >= 500 ? 'Internal server error' : error.message,
  };
  if (error.details) {
    body.details = error.details;
  }
  response.status(statusCode).json(body);
}
