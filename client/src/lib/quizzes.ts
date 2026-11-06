// Quizzes belong to the planner who wrote them and can be reused across events. A quiz is
// a flat list of questions, grouped into categories, or split into rounds of categories with
// an intermission between rounds, all in the planner's order.

export type QuizStructure = 'flat' | 'categorized' | 'rounds';
export type QuestionType = 'multiple_choice' | 'written' | 'true_false';
export type MediaKind = 'image' | 'video' | 'audio' | 'youtube';

/** A photo, video, sound clip or YouTube video shown with a question. */
export interface QuestionMedia {
  kind: MediaKind;
  /** An uploaded file, a link to one, or a YouTube watch link. */
  url: string;
  /** The uploaded file's name, shown to the planner. */
  name: string | null;
}

export interface QuizSummary {
  id: string;
  name: string;
  description: string | null;
  structure: QuizStructure;
  question_count: number;
  category_count: number;
  round_count: number;
  /** How many events play this quiz. */
  event_count: number;
  created_at: string;
  updated_at: string;
}

export interface QuizRound {
  id: string;
  name: string;
  position: number;
}

export interface RoundInput {
  name: string;
}

export interface QuizCategory {
  id: string;
  /** Set only in a rounds quiz; position is then the order within the round. */
  round_id: string | null;
  name: string;
  /** The type new questions in this category start as. */
  question_type: QuestionType;
  position: number;
}

export interface CategoryInput {
  name: string;
  question_type: QuestionType;
  /** Required in a rounds quiz, null otherwise. */
  round_id: string | null;
}

/**
 * The answer, shaped by the question's type:
 * - multiple_choice: `answer` is the index of the correct choice
 * - true_false: `answer` is true or false
 * - written: `answer` is what the planner checks players' answers against
 */
export type QuestionAnswer =
  | { question_type: 'multiple_choice'; choices: string[]; answer: number }
  | { question_type: 'true_false'; choices: null; answer: boolean }
  | { question_type: 'written'; choices: null; answer: string };

export type QuizQuestion = QuestionAnswer & {
  id: string;
  /** Null in a flat quiz. */
  category_id: string | null;
  position: number;
  /** Formatted HTML. See promptText for its words. */
  prompt: string;
  media: QuestionMedia[];
};

export interface QuizDetail extends QuizSummary {
  rounds: QuizRound[];
  /** Round by round, each in the planner's order. */
  categories: QuizCategory[];
  /** Category by category, each in the planner's order. */
  questions: QuizQuestion[];
}

export interface QuizInput {
  name: string;
  description: string | null;
  structure: QuizStructure;
}

export type QuestionInput = QuestionAnswer & {
  prompt: string;
  media: QuestionMedia[];
  category_id: string | null;
};

export interface CategoryOrder {
  id: string;
  question_ids: string[];
}

export type QuizOrder =
  | { question_ids: string[] }
  | { categories: CategoryOrder[] }
  | { rounds: { id: string; categories: CategoryOrder[] }[] };

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple Choice',
  written: 'Written',
  true_false: 'True or False',
};

export const STRUCTURE_LABELS: Record<QuizStructure, string> = {
  flat: 'Question List',
  categorized: 'Categories',
  rounds: 'Rounds',
};

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 6;
/** A question can show one photo, video, sound clip or YouTube video. */
export const MAX_MEDIA = 1;
export const PROMPT_MAX = 500;

export const MEDIA_KIND_LABELS: Record<MediaKind, { singular: string; plural: string }> = {
  image: { singular: 'photo', plural: 'photos' },
  video: { singular: 'video', plural: 'videos' },
  audio: { singular: 'sound clip', plural: 'sound clips' },
  youtube: { singular: 'YouTube video', plural: 'YouTube videos' },
};

/** A formatted prompt's words, for lists and length checks. */
export const promptText = (html: string) => {
  const spaced = html.replace(/<(br|\/p|\/li|\/blockquote)[^>]*>/gi, ' ');
  const text = new DOMParser().parseFromString(spaced, 'text/html').body.textContent ?? '';
  return text.replace(/\s+/g, ' ').trim();
};

/** The video id of a YouTube watch, share, shorts or embed link, or null. */
export const youtubeVideoId = (url: string): string | null => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') id = parsed.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, section, value] = parsed.pathname.split('/');
    if (section === 'watch') id = parsed.searchParams.get('v');
    else if (['shorts', 'embed', 'live'].includes(section)) id = value ?? null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
};

const EXTENSION_KINDS: [RegExp, MediaKind][] = [
  [/\.(jpe?g|png|gif|webp|avif|svg)$/i, 'image'],
  [/\.(mp4|webm|mov|m4v|ogv)$/i, 'video'],
  [/\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/i, 'audio'],
];

/** What a pasted link shows: YouTube, or a photo, video or sound clip by its file extension. */
export const mediaKindFromLink = (url: string): MediaKind | null => {
  if (youtubeVideoId(url)) return 'youtube';
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  return EXTENSION_KINDS.find(([pattern]) => pattern.test(pathname))?.[1] ?? null;
};

/** What an uploaded file is, from its type. */
export const mediaKindFromFile = (file: File): MediaKind | null => {
  const [group] = file.type.split('/');
  if (group === 'image' || group === 'video' || group === 'audio') return group;
  return EXTENSION_KINDS.find(([pattern]) => pattern.test(file.name))?.[1] ?? null;
};

/** What a planner chooses to add to a question; a YouTube link counts as a video. */
export type MediaType = 'photo' | 'video' | 'audio';

export const mediaType = (kind: MediaKind): MediaType =>
  kind === 'image' ? 'photo' : kind === 'audio' ? 'audio' : 'video';

/** Each type's names, the files its picker offers, and what its link box asks for. */
export const MEDIA_TYPE_INFO: Record<
  MediaType,
  { label: string; title: string; accept: string; linkPlaceholder: string }
> = {
  photo: {
    label: 'Photo',
    title: 'Photo',
    accept: 'image/*',
    linkPlaceholder: 'Or paste a photo link',
  },
  video: {
    label: 'Video',
    title: 'Video',
    accept: 'video/*',
    linkPlaceholder: 'Or paste a YouTube or video link',
  },
  audio: {
    label: 'Audio',
    title: 'Sound Clip',
    accept: 'audio/*',
    linkPlaceholder: 'Or paste a sound clip link',
  },
};

/** The https link of the first image in copied web content, such as a photo copied from a page. */
export const imageLinkFromHtml = (html: string): string | null => {
  if (!html) return null;
  const src = new DOMParser().parseFromString(html, 'text/html').querySelector('img')?.src ?? '';
  return src.toLowerCase().startsWith('https://') ? src : null;
};

/** "1 photo · 2 sound clips". */
export const mediaSummary = (media: QuestionMedia[]) =>
  (Object.keys(MEDIA_KIND_LABELS) as MediaKind[])
    .map((kind) => {
      const count = media.filter((item) => item.kind === kind).length;
      const { singular, plural } = MEDIA_KIND_LABELS[kind];
      return count > 0 ? countLabel(count, singular, plural) : null;
    })
    .filter(Boolean)
    .join(' · ');

/** A question's text for lists, or what it shows when it's only media: "Sound clip question". */
export const questionTitle = (question: { prompt: string; media: QuestionMedia[] }) => {
  const text = promptText(question.prompt);
  if (text || question.media.length === 0) return text;
  const { singular } = MEDIA_KIND_LABELS[question.media[0].kind];
  return `${singular.charAt(0).toUpperCase()}${singular.slice(1)} question`;
};

/** 0 → "A". */
export const choiceLetter = (index: number) => String.fromCharCode(65 + index);

/** The correct answer as the planner reads it: "B. Paris", "True" or the written answer. */
export const answerLabel = (question: QuestionAnswer): string => {
  if (question.question_type === 'multiple_choice') {
    return `${choiceLetter(question.answer)}. ${question.choices[question.answer] ?? ''}`;
  }
  if (question.question_type === 'true_false') return question.answer ? 'True' : 'False';
  return question.answer;
};

export const countLabel = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`;

/** "30 questions · 6 categories · 2 rounds", leaving out what the quiz isn't split into. */
export const quizCountsLabel = (
  quiz: Pick<QuizSummary, 'structure' | 'question_count' | 'category_count' | 'round_count'>,
) =>
  [
    countLabel(quiz.question_count, 'question'),
    quiz.structure === 'flat' ? null : countLabel(quiz.category_count, 'category', 'categories'),
    quiz.structure === 'rounds' ? countLabel(quiz.round_count, 'round') : null,
  ]
    .filter(Boolean)
    .join(' · ');

export const questionsIn = (questions: QuizQuestion[], categoryId: string | null) =>
  questions.filter((question) => question.category_id === categoryId);

export const categoriesIn = (categories: QuizCategory[], roundId: string | null) =>
  categories.filter((category) => category.round_id === roundId);

/**
 * The quiz's whole order of rounds, categories and questions, for saving with a change.
 * `categories` replaces the category order (only the order within each round matters) and
 * `questionIds` replaces the question order of the categories it names.
 */
export const quizOrder = (
  quiz: QuizDetail,
  {
    rounds = quiz.rounds,
    categories = quiz.categories,
    questionIds = {},
  }: {
    rounds?: QuizRound[];
    categories?: QuizCategory[];
    questionIds?: Record<string, string[]>;
  } = {},
): QuizOrder => {
  const categoryOrder = (list: QuizCategory[]): CategoryOrder[] =>
    list.map(({ id }) => ({
      id,
      question_ids: questionIds[id] ?? questionsIn(quiz.questions, id).map((q) => q.id),
    }));
  if (quiz.structure === 'flat') return { question_ids: quiz.questions.map((q) => q.id) };
  if (quiz.structure === 'categorized') return { categories: categoryOrder(categories) };
  return {
    rounds: rounds.map(({ id }) => ({
      id,
      categories: categoryOrder(categoriesIn(categories, id)),
    })),
  };
};
