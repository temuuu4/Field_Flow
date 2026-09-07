import { ApiError } from '../errors/ApiError.js';

export function notFound(request, response, next) {
  next(new ApiError(404, `Route not found: ${request.method} ${request.originalUrl}`));
}
