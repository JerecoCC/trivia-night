'use strict';

// A question's formatted prompt and its media (photos, videos, sound clips and YouTube
// videos). Players will see both, so prompts are cleaned down to simple formatting and media
// must be https links.

const sanitizeHtml = require('sanitize-html');
const { badRequest } = require('./validation');

const PROMPT_TEXT_MAX = 500;
const PROMPT_HTML_MAX = 5000;
const MEDIA_MAX = 4;
const MEDIA_NAME_MAX = 200;
const MEDIA_URL_MAX = 2000;
const MEDIA_KINDS = ['image', 'video', 'audio', 'youtube'];

/** The formatting a prompt may keep: what the editor makes, plus links. */
const PROMPT_HTML_OPTIONS = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'code',
    'ul',
    'ol',
    'li',
    'blockquote',
    'a',
  ],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Links open away from the game.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
  },
};

const escapeHtml = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };

/** A prompt's words without formatting, for length checks and plain listings. */
function promptText(html) {
  const spaced = html.replace(/<(br|\/p|\/li|\/blockquote)[^>]*>/gi, ' ');
  return sanitizeHtml(spaced, { allowedTags: [], allowedAttributes: {} })
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_match, entity) => ENTITIES[entity])
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cleans a prompt down to the allowed formatting. Plain text (no tags) is kept as a
 * paragraph, so every stored prompt is HTML. Pass `required: false` for a question whose
 * media can stand on its own: an empty prompt is then stored as ''.
 */
function normalizePrompt(value, { required = true } = {}) {
  const missing = () => {
    if (required) throw badRequest('prompt is required');
    return '';
  };
  if (value === null || value === undefined) return missing();
  if (typeof value !== 'string') throw badRequest('prompt must be text');
  const input = value.trim();
  const html = sanitizeHtml(
    /<[a-z/!]/i.test(input) ? input : `<p>${escapeHtml(input)}</p>`,
    PROMPT_HTML_OPTIONS,
  ).trim();
  const text = promptText(html);
  if (!text) return missing();
  if (text.length > PROMPT_TEXT_MAX) {
    throw badRequest(`prompt must be ${PROMPT_TEXT_MAX} characters or fewer`);
  }
  if (html.length > PROMPT_HTML_MAX) throw badRequest('prompt has too much formatting');
  return html;
}

/** The video id of a YouTube watch, share, shorts or embed link, or null. */
function youtubeVideoId(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www|m|music)\./, '');
  let id = null;
  if (host === 'youtu.be') id = parsed.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, section, value] = parsed.pathname.split('/');
    id =
      section === 'watch'
        ? parsed.searchParams.get('v')
        : ['shorts', 'embed', 'live'].includes(section)
          ? value
          : null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}

function normalizeMediaItem(item, index) {
  const label = `media ${index + 1}`;
  if (!item || typeof item !== 'object') throw badRequest(`${label} is invalid`);
  if (!MEDIA_KINDS.includes(item.kind)) {
    throw badRequest(`${label} must be one of: ${MEDIA_KINDS.join(', ')}`);
  }
  if (typeof item.url !== 'string' || !item.url.trim()) throw badRequest(`${label} needs a link`);
  const url = item.url.trim();
  if (url.length > MEDIA_URL_MAX) throw badRequest(`${label}'s link is too long`);

  let name = null;
  if (item.name != null) {
    if (typeof item.name !== 'string') throw badRequest(`${label}'s name must be text`);
    name = item.name.trim().slice(0, MEDIA_NAME_MAX) || null;
  }

  if (item.kind === 'youtube') {
    const id = youtubeVideoId(url);
    if (!id) throw badRequest(`${label} isn't a YouTube video link`);
    return { kind: 'youtube', url: `https://www.youtube.com/watch?v=${id}`, name };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw badRequest(`${label} isn't a valid link`);
  }
  // Players' pages are served over https, which blocks http media.
  if (parsed.protocol !== 'https:') throw badRequest(`${label} must be an https link`);
  return { kind: item.kind, url: parsed.toString(), name };
}

/** Validates a question's media: up to four photos, videos, sound clips or YouTube videos. */
function normalizeMedia(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw badRequest('media must be a list');
  if (value.length > MEDIA_MAX) {
    throw badRequest(`A question can have up to ${MEDIA_MAX} photos, videos or sound clips`);
  }
  return value.map(normalizeMediaItem);
}

module.exports = {
  MEDIA_KINDS,
  MEDIA_MAX,
  normalizeMedia,
  normalizePrompt,
  promptText,
  youtubeVideoId,
};
