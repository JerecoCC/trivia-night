import { answerLabel, choiceLetter, questionTitle, quizCountsLabel } from './quizzes';

describe('quizzes', () => {
  it('labels the correct answer for each question type', () => {
    expect(
      answerLabel({ question_type: 'multiple_choice', choices: ['Lyon', 'Paris'], answer: 1 }),
    ).toBe('B. Paris');
    expect(answerLabel({ question_type: 'true_false', choices: null, answer: false })).toBe(
      'False',
    );
    expect(answerLabel({ question_type: 'written', choices: null, answer: 'Ada Lovelace' })).toBe(
      'Ada Lovelace',
    );
    expect(choiceLetter(5)).toBe('F');
  });

  it('counts questions, and categories and rounds only when the quiz has them', () => {
    expect(
      quizCountsLabel({ structure: 'flat', question_count: 1, category_count: 0, round_count: 0 }),
    ).toBe('1 question');
    expect(
      quizCountsLabel({
        structure: 'categorized',
        question_count: 12,
        category_count: 1,
        round_count: 0,
      }),
    ).toBe('12 questions · 1 category');
    expect(
      quizCountsLabel({
        structure: 'categorized',
        question_count: 0,
        category_count: 3,
        round_count: 0,
      }),
    ).toBe('0 questions · 3 categories');
    expect(
      quizCountsLabel({
        structure: 'rounds',
        question_count: 30,
        category_count: 6,
        round_count: 2,
      }),
    ).toBe('30 questions · 6 categories · 2 rounds');
  });

  it('titles a question by its words, or by its media when it has none', () => {
    const clip = { kind: 'audio' as const, url: 'https://cdn.example.com/a.mp3', name: null };
    expect(questionTitle({ prompt: '<p>Name <em>that</em> tune</p>', media: [clip] })).toBe(
      'Name that tune',
    );
    expect(questionTitle({ prompt: '', media: [clip] })).toBe('Sound clip question');
    expect(questionTitle({ prompt: '', media: [{ ...clip, kind: 'youtube' as const }] })).toBe(
      'YouTube video question',
    );
  });
});
