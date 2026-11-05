'use strict';

// Question media is uploaded straight from the browser to Vercel Blob, so large videos never
// pass through this server. The server only hands out upload tokens and deletes files that
// questions stop using.

const { del } = require('@vercel/blob');

const QUIZ_MEDIA_PREFIX = 'quiz-media/';
const QUIZ_MEDIA_MAX_BYTES = 100 * 1024 * 1024;
const QUIZ_MEDIA_TYPES = ['image/*', 'video/*', 'audio/*'];

const uploadsEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);

/** Whether a link points at a file uploaded to this app's media folder. */
function isUploadedMedia(url) {
  try {
    const { hostname, pathname } = new URL(url);
    return (
      hostname.endsWith('.blob.vercel-storage.com') &&
      pathname.replace(/^\/+/, '').startsWith(QUIZ_MEDIA_PREFIX)
    );
  } catch {
    return false;
  }
}

/** The links of a question's media, or of many questions' media. */
const mediaUrls = (...mediaLists) =>
  mediaLists
    .flat(Infinity)
    .map((item) => item?.url)
    .filter((url) => typeof url === 'string');

/**
 * Deletes uploaded files that nothing uses any more. Links to other sites are left alone.
 * Best effort: a failure is logged, never shown to the planner, since their change saved.
 */
async function deleteUploadedMedia(urls) {
  const uploaded = [...new Set(urls.filter(isUploadedMedia))];
  if (uploaded.length === 0 || !uploadsEnabled()) return;
  try {
    await del(uploaded);
  } catch (err) {
    console.error('Failed to delete question media:', err);
  }
}

module.exports = {
  QUIZ_MEDIA_MAX_BYTES,
  QUIZ_MEDIA_PREFIX,
  QUIZ_MEDIA_TYPES,
  deleteUploadedMedia,
  isUploadedMedia,
  mediaUrls,
  uploadsEnabled,
};
