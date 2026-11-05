'use strict';

jest.mock('@vercel/blob/client', () => ({ handleUpload: jest.fn() }));
jest.mock('../middleware/auth', () => ({
  requireAuth: (req, res, next) => {
    req.user = { id: 'user-1', role: 'user' };
    next();
  },
}));

const request = require('supertest');
const express = require('express');
const { handleUpload } = require('@vercel/blob/client');
const { errorHandler } = require('../middleware/errors');
const router = require('./uploads');

const app = express();
app.use(express.json());
app.use('/api/uploads', router);
app.use(errorHandler);

// handleUpload asks the route which files it allows before making a token.
const tokenFor = (pathname) => {
  handleUpload.mockImplementationOnce(async ({ onBeforeGenerateToken }) => ({
    type: 'blob.generate-client-token',
    options: await onBeforeGenerateToken(pathname, null, false),
  }));
  return request(app)
    .post('/api/uploads/quiz-media')
    .send({ type: 'blob.generate-client-token', payload: { pathname } });
};

afterEach(() => {
  // Also drops a queued implementation that a refused request never used.
  jest.resetAllMocks();
  delete process.env.BLOB_READ_WRITE_TOKEN;
});

describe('uploads', () => {
  it('say whether uploads are set up', async () => {
    expect((await request(app).get('/api/uploads/status')).body).toEqual({ enabled: false });
    process.env.BLOB_READ_WRITE_TOKEN = 'token';
    expect((await request(app).get('/api/uploads/status')).body).toEqual({ enabled: true });
  });

  it('refuse tokens until uploads are set up', async () => {
    const res = await tokenFor('quiz-media/song.mp3');

    expect(res.status).toBe(503);
    expect(handleUpload).not.toHaveBeenCalled();
  });

  it('allow photos, videos and sound clips up to 100 MB in the quiz media folder', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'token';

    const res = await tokenFor('quiz-media/song.mp3');

    expect(res.status).toBe(200);
    expect(res.body.options).toEqual({
      allowedContentTypes: ['image/*', 'video/*', 'audio/*'],
      maximumSizeInBytes: 100 * 1024 * 1024,
      addRandomSuffix: true,
    });
  });

  it('refuse files outside the quiz media folder', async () => {
    process.env.BLOB_READ_WRITE_TOKEN = 'token';

    const res = await tokenFor('leagues/logo.png');

    expect(res.status).toBe(400);
  });
});
