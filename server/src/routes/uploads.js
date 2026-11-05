'use strict';

// Upload tokens for question media. The browser uploads the file to Vercel Blob itself;
// see lib/uploads.js.

const router = require('express').Router();
const { handleUpload } = require('@vercel/blob/client');
const { requireAuth } = require('../middleware/auth');
const { HttpError, asyncRoute } = require('../middleware/errors');
const {
  QUIZ_MEDIA_MAX_BYTES,
  QUIZ_MEDIA_PREFIX,
  QUIZ_MEDIA_TYPES,
  uploadsEnabled,
} = require('../lib/uploads');

router.use(requireAuth);

// ---------------------------------------------------------------------------
// GET /api/uploads/status  – whether file uploads are set up (links work either way)
// ---------------------------------------------------------------------------
router.get('/status', (_req, res) => res.json({ enabled: uploadsEnabled() }));

// ---------------------------------------------------------------------------
// POST /api/uploads/quiz-media  – called by @vercel/blob/client's upload() for a token
// Photos, videos and sound clips up to 100 MB, saved under quiz-media/.
// ---------------------------------------------------------------------------
router.post(
  '/quiz-media',
  asyncRoute(async (req, res) => {
    if (!uploadsEnabled()) throw new HttpError(503, 'File uploads aren’t set up yet');
    try {
      const result = await handleUpload({
        body: req.body,
        request: req,
        onBeforeGenerateToken: async (pathname) => {
          if (!pathname.startsWith(QUIZ_MEDIA_PREFIX)) {
            throw new Error('Uploads must go in the quiz media folder');
          }
          return {
            allowedContentTypes: QUIZ_MEDIA_TYPES,
            maximumSizeInBytes: QUIZ_MEDIA_MAX_BYTES,
            addRandomSuffix: true,
          };
        },
      });
      return res.json(result);
    } catch (err) {
      throw new HttpError(400, err.message || 'Couldn’t start the upload');
    }
  }),
);

module.exports = router;
