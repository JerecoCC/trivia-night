'use strict';

const {
  normalizeMedia,
  normalizePrompt,
  promptText,
  youtubeVideoId,
} = require('./questionContent');

describe('normalizePrompt', () => {
  it('keeps plain text as an escaped paragraph', () => {
    expect(normalizePrompt(' Is 3 < 4 & 5? ')).toBe('<p>Is 3 &lt; 4 &amp; 5?</p>');
  });

  it('keeps simple formatting and drops scripts, images and unsafe links', () => {
    expect(
      normalizePrompt(
        '<p>Who <strong>sang</strong> <em>this</em>?<script>alert(1)</script>' +
          '<img src=x onerror=alert(1)></p><ul><li>One</li></ul>' +
          '<a href="javascript:alert(1)">bad</a> <a href="https://e.com" onclick="x">good</a>',
      ),
    ).toBe(
      '<p>Who <strong>sang</strong> <em>this</em>?</p><ul><li>One</li></ul>' +
        '<a target="_blank" rel="noopener noreferrer">bad</a> ' +
        '<a href="https://e.com" target="_blank" rel="noopener noreferrer">good</a>',
    );
  });

  it('needs some words, and limits them to 500 characters', () => {
    expect(() => normalizePrompt('<p> </p><p><br></p>')).toThrow('prompt is required');
    expect(() => normalizePrompt(undefined)).toThrow('prompt is required');
    expect(() => normalizePrompt(`<p>${'a'.repeat(501)}</p>`)).toThrow(/500 characters/);
    expect(normalizePrompt(`<p><strong>${'a'.repeat(500)}</strong></p>`)).toContain('<strong>');
  });

  it('stores an empty prompt as blank when it is optional', () => {
    expect(normalizePrompt('<p><br></p>', { required: false })).toBe('');
    expect(normalizePrompt(null, { required: false })).toBe('');
    expect(normalizePrompt('Hi', { required: false })).toBe('<p>Hi</p>');
    expect(() => normalizePrompt(42, { required: false })).toThrow('prompt must be text');
  });
});

describe('promptText', () => {
  it('reads the words of a formatted prompt', () => {
    expect(promptText('<p>Is 3 &lt; 4 &amp; 5?</p><ul><li>One</li><li>Two</li></ul>')).toBe(
      'Is 3 < 4 & 5? One Two',
    );
  });
});

describe('youtubeVideoId', () => {
  it.each([
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10',
    'https://youtu.be/dQw4w9WgXcQ',
    'https://m.youtube.com/shorts/dQw4w9WgXcQ',
    'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
  ])('reads %s', (url) => {
    expect(youtubeVideoId(url)).toBe('dQw4w9WgXcQ');
  });

  it('is null for other links', () => {
    expect(youtubeVideoId('https://vimeo.com/123')).toBeNull();
    expect(youtubeVideoId('not a link')).toBeNull();
  });
});

describe('normalizeMedia', () => {
  it('defaults to none and keeps up to four items', () => {
    expect(normalizeMedia(undefined)).toEqual([]);
    expect(
      normalizeMedia([
        { kind: 'image', url: ' https://e.com/a.jpg ', name: ' a.jpg ' },
        { kind: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ' },
      ]),
    ).toEqual([
      { kind: 'image', url: 'https://e.com/a.jpg', name: 'a.jpg' },
      { kind: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', name: null },
    ]);
    const five = Array.from({ length: 5 }, () => ({ kind: 'image', url: 'https://e.com/a.jpg' }));
    expect(() => normalizeMedia(five)).toThrow(/up to 4/);
  });

  it.each([
    [{ kind: 'gif', url: 'https://e.com/a.gif' }, /must be one of/],
    [{ kind: 'image', url: '' }, /needs a link/],
    [{ kind: 'image', url: 'http://e.com/a.jpg' }, /https link/],
    [{ kind: 'audio', url: 'javascript:alert(1)' }, /https link/],
    [{ kind: 'video', url: 'nope' }, /valid link/],
    [{ kind: 'youtube', url: 'https://vimeo.com/1' }, /YouTube/],
  ])('rejects %j', (item, message) => {
    expect(() => normalizeMedia([item])).toThrow(message);
  });
});
