/**
 * @module validate
 * @description Thin wrapper around express-validator that short-circuits the
 * request chain and returns a structured 422 payload when validation errors
 * are present.
 */
import { validationResult } from 'express-validator';

/**
 * Express middleware factory.  Pass the array of validators produced by
 * express-validator helper chains as the sole argument.
 *
 * @param   {import('express-validator').ValidationChain[]} validators
 * @returns {import('express').RequestHandler[]}
 *
 * @example
 *   router.post('/parse',
 *     validate([
 *       body('naturalLanguageInput').notEmpty().withMessage('Input required'),
 *       body('datasetId').notEmpty().withMessage('datasetId required'),
 *     ]),
 *     parseNLRuleHandler,
 *   );
 */
export const validate = (validators) => [
  ...validators,

  /** @type {import('express').RequestHandler} */
  (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();

    return res.status(422).json({
      success: false,
      error:   'Validation failed',
      details: errors.array().map((e) => ({
        field:   e.path,
        message: e.msg,
      })),
    });
  },
];
