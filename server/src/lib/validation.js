'use strict';

const { HttpError } = require('../middleware/errors');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const badRequest = (message) => new HttpError(400, message);

const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value);

/** Required trimmed text, at most `max` characters. */
const toText = (value, name, max) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw badRequest(`${name} is required`);
  if (text.length > max) throw badRequest(`${name} must be at most ${max} characters`);
  return text;
};

/** Optional trimmed text: blank becomes null. */
const toOptionalText = (value, name, max) => {
  if (value == null) return null;
  if (typeof value !== 'string') throw badRequest(`${name} must be text`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > max) throw badRequest(`${name} must be at most ${max} characters`);
  return text;
};

module.exports = { badRequest, isUuid, toOptionalText, toText };
