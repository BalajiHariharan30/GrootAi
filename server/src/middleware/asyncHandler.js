/**
 * @module asyncHandler
 * @description Wraps an async Express route handler so that any rejected
 * promise is automatically forwarded to the Express error middleware via
 * `next(err)`.  Eliminates repetitive try/catch blocks in route files.
 *
 * @param   {import('express').RequestHandler} fn  Async route handler.
 * @returns {import('express').RequestHandler}
 *
 * @example
 *   router.get('/profile', asyncHandler(async (req, res) => {
 *     const data = await MyService.getData(req.params.id);
 *     res.json({ success: true, data });
 *   }));
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
