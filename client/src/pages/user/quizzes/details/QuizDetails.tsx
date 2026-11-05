import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Button from '@jerecocc/tracker-ui/components/Button/Button';
import ConfirmModal from '@jerecocc/tracker-ui/components/ConfirmModal/ConfirmModal';
import Section from '@jerecocc/tracker-ui/components/Section/Section';
import useBackgroundModalAction from '@/hooks/useBackgroundModalAction';
import useQuiz from '@/hooks/useQuiz';
import { moveItem } from '@/hooks/useReorderableList';
import {
  categoriesIn,
  countLabel,
  questionsIn,
  quizOrder,
  type QuestionInput,
  type QuizCategory,
  type QuizQuestion,
  type QuizRound,
} from '@/lib/quizzes';
import EmptyMessage from '@/shared/EmptyMessage/EmptyMessage';
import QuizFormModal from '../QuizFormModal';
import CategoryFormModal from './CategoryFormModal';
import CategoryList from './CategoryList';
import Metric from './Metric';
import QuestionFormModal from './QuestionFormModal';
import { QuestionList, ReorderQuestionList } from './QuestionList';
import RoundFormModal from './RoundFormModal';
import RoundList from './RoundList';
import styles from './QuizDetails.module.scss';

type QuestionModal = { editTarget: QuizQuestion | null; categoryId: string | null };
type CategoryModal = { editTarget: QuizCategory | null; roundId: string | null };
type RoundModal = { editTarget: QuizRound | null };
type DeleteTarget =
  | { kind: 'question'; question: QuizQuestion; number: number }
  | { kind: 'category'; category: QuizCategory; questionCount: number }
  | { kind: 'round'; round: QuizRound; categoryCount: number; questionCount: number };

/** "its 2 categories and 9 questions", leaving out what there's none of. */
const contentsLabel = (counts: { categoryCount?: number; questionCount: number }) => {
  const parts = [
    counts.categoryCount ? countLabel(counts.categoryCount, 'category', 'categories') : null,
    counts.questionCount ? countLabel(counts.questionCount, 'question') : null,
  ].filter(Boolean);
  return parts.length > 0 ? ` and its ${parts.join(' and ')}` : '';
};

const QuizDetailsPage = () => {
  const { quizId = '' } = useParams();
  const navigate = useNavigate();
  const {
    quiz,
    loading,
    notFound,
    updateQuiz,
    addRound,
    updateRound,
    deleteRound,
    addCategory,
    updateCategory,
    deleteCategory,
    addQuestion,
    updateQuestion,
    deleteQuestion,
    saveOrder,
  } = useQuiz(quizId);

  const [quizFormOpen, setQuizFormOpen] = useState(false);
  const [questionModal, setQuestionModal] = useState<QuestionModal | null>(null);
  const [categoryModal, setCategoryModal] = useState<CategoryModal | null>(null);
  const [roundModal, setRoundModal] = useState<RoundModal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [reordering, setReordering] = useState(false);

  const deleteTargetId =
    deleteTarget?.kind === 'question'
      ? deleteTarget.question.id
      : deleteTarget?.kind === 'category'
        ? deleteTarget.category.id
        : (deleteTarget?.round.id ?? null);
  const { hidden: deleteHidden, runSettled: runDelete } = useBackgroundModalAction({
    target: deleteTargetId,
    onDone: () => setDeleteTarget(null),
  });

  const backButton = (
    <Button
      variant="ghost"
      intent="neutral"
      icon="arrow_back"
      size="small"
      className={styles.back}
      onClick={() => navigate('/quizzes')}
    >
      All Quizzes
    </Button>
  );

  if (loading || !quiz) {
    return (
      <div className={styles.page}>
        {backButton}
        <EmptyMessage>
          {loading
            ? 'Loading...'
            : notFound
              ? 'This quiz doesn’t exist.'
              : 'Couldn’t load this quiz.'}
        </EmptyMessage>
      </div>
    );
  }

  const hasRounds = quiz.structure === 'rounds';
  const hasCategories = quiz.structure !== 'flat';
  // Reordering only matters once some list has two questions to swap.
  const canReorder = (hasCategories ? quiz.categories : [{ id: null }]).some(
    (list) => questionsIn(quiz.questions, list.id).length > 1,
  );
  const showReorder = reordering && canReorder;

  // Every order change sends the whole layout, so it's checked against the quiz as it is now.
  const moveRound = (round: QuizRound, delta: -1 | 1) => {
    const index = quiz.rounds.findIndex((r) => r.id === round.id);
    void saveOrder(quizOrder(quiz, { rounds: moveItem(quiz.rounds, index, index + delta) }));
  };

  // A category moves among the others in its round (in a categorized quiz, among all of them).
  const moveCategory = (category: QuizCategory, delta: -1 | 1) => {
    const siblings = categoriesIn(quiz.categories, category.round_id);
    const index = siblings.findIndex((c) => c.id === category.id);
    const others = quiz.categories.filter((c) => c.round_id !== category.round_id);
    void saveOrder(
      quizOrder(quiz, { categories: [...others, ...moveItem(siblings, index, index + delta)] }),
    );
  };

  const saveQuestionOrder = (categoryId: string | null, questionIds: string[]) =>
    categoryId === null
      ? saveOrder({ question_ids: questionIds })
      : saveOrder(quizOrder(quiz, { questionIds: { [categoryId]: questionIds } }));

  const saveQuestion = (input: QuestionInput) => {
    const target = questionModal?.editTarget;
    return target ? updateQuestion(target.id, input) : addQuestion(input);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'question') {
      const { id } = deleteTarget.question;
      void runDelete(() => deleteQuestion(id), { pending: 'Deleting question…' });
    } else if (deleteTarget.kind === 'category') {
      const { id } = deleteTarget.category;
      void runDelete(() => deleteCategory(id), { pending: 'Deleting category…' });
    } else {
      const { id } = deleteTarget.round;
      void runDelete(() => deleteRound(id), { pending: 'Deleting round…' });
    }
  };

  const questionNumber = (question: QuizQuestion) =>
    questionsIn(quiz.questions, question.category_id).findIndex((q) => q.id === question.id) + 1;

  const categoryListProps = {
    questions: quiz.questions,
    reordering: showReorder,
    onMoveCategory: moveCategory,
    onSaveQuestionOrder: saveQuestionOrder,
    onAddQuestion: (category: QuizCategory) =>
      setQuestionModal({ editTarget: null, categoryId: category.id }),
    onEdit: (category: QuizCategory) =>
      setCategoryModal({ editTarget: category, roundId: category.round_id }),
    onDelete: (category: QuizCategory) =>
      setDeleteTarget({
        kind: 'category',
        category,
        questionCount: questionsIn(quiz.questions, category.id).length,
      }),
    onEditQuestion: (question: QuizQuestion) =>
      setQuestionModal({ editTarget: question, categoryId: question.category_id }),
    onDeleteQuestion: (question: QuizQuestion) =>
      setDeleteTarget({ kind: 'question', question, number: questionNumber(question) }),
  };

  const addButton = hasRounds ? (
    <Button
      icon="add"
      size="medium"
      onClick={() => setRoundModal({ editTarget: null })}
    >
      Add Round
    </Button>
  ) : hasCategories ? (
    <Button
      icon="add"
      size="medium"
      onClick={() => setCategoryModal({ editTarget: null, roundId: null })}
    >
      Add Category
    </Button>
  ) : (
    <Button
      icon="add"
      size="medium"
      onClick={() => setQuestionModal({ editTarget: null, categoryId: null })}
    >
      Add Question
    </Button>
  );

  const content = hasRounds ? (
    quiz.rounds.length === 0 ? (
      <EmptyMessage>No rounds yet. Add one, then add categories to it.</EmptyMessage>
    ) : (
      <RoundList
        {...categoryListProps}
        rounds={quiz.rounds}
        categories={quiz.categories}
        onMoveRound={moveRound}
        onAddCategory={(round) => setCategoryModal({ editTarget: null, roundId: round.id })}
        onEditRound={(round) => setRoundModal({ editTarget: round })}
        onDeleteRound={(round) => {
          const roundCategories = categoriesIn(quiz.categories, round.id);
          setDeleteTarget({
            kind: 'round',
            round,
            categoryCount: roundCategories.length,
            questionCount: roundCategories.reduce(
              (count, category) => count + questionsIn(quiz.questions, category.id).length,
              0,
            ),
          });
        }}
      />
    )
  ) : hasCategories ? (
    quiz.categories.length === 0 ? (
      <EmptyMessage>No categories yet. Add one, then add questions to it.</EmptyMessage>
    ) : (
      <CategoryList
        {...categoryListProps}
        categories={quiz.categories}
      />
    )
  ) : quiz.questions.length === 0 ? (
    <EmptyMessage>No questions yet. Add one to get started.</EmptyMessage>
  ) : showReorder ? (
    <ReorderQuestionList
      questions={quiz.questions}
      onSaveOrder={(ids) => saveQuestionOrder(null, ids)}
    />
  ) : (
    <QuestionList
      questions={quiz.questions}
      onEdit={(question) => setQuestionModal({ editTarget: question, categoryId: null })}
      onDelete={(question) =>
        setDeleteTarget({ kind: 'question', question, number: questionNumber(question) })
      }
    />
  );

  return (
    <div className={styles.page}>
      {backButton}
      <Section
        title={quiz.name}
        titleAccessory={
          <div className={styles.metrics}>
            <Metric
              count={quiz.question_count}
              singular="Question"
            />
            {hasCategories && (
              <Metric
                count={quiz.category_count}
                singular="Category"
                plural="Categories"
              />
            )}
            {hasRounds && (
              <Metric
                count={quiz.round_count}
                singular="Round"
              />
            )}
            {quiz.event_count > 0 && (
              <Metric
                count={quiz.event_count}
                singular="Event"
              />
            )}
          </div>
        }
        action={
          showReorder ? (
            <Button
              icon="check"
              size="medium"
              onClick={() => setReordering(false)}
            >
              Done
            </Button>
          ) : (
            <div className={styles.headerActions}>
              {canReorder && (
                <Button
                  variant="outlined"
                  intent="neutral"
                  icon="sort"
                  size="medium"
                  onClick={() => setReordering(true)}
                >
                  Reorder
                </Button>
              )}
              <Button
                variant="outlined"
                intent="neutral"
                icon="edit"
                size="medium"
                onClick={() => setQuizFormOpen(true)}
              >
                Edit Quiz
              </Button>
              {addButton}
            </div>
          )
        }
      >
        {(quiz.description || showReorder) && (
          <div className={styles.summary}>
            {quiz.description && <p className={styles.description}>{quiz.description}</p>}
            {showReorder && (
              <p className={styles.hint}>
                Drag questions or use the arrows to change their order
                {hasCategories && '. To move a question to another category, edit it'}.
              </p>
            )}
          </div>
        )}

        {content}
      </Section>

      <QuizFormModal
        open={quizFormOpen}
        editTarget={quiz}
        onClose={() => setQuizFormOpen(false)}
        onSave={updateQuiz}
      />

      <QuestionFormModal
        open={!!questionModal}
        editTarget={questionModal?.editTarget ?? null}
        categories={hasCategories ? quiz.categories : null}
        rounds={quiz.rounds}
        defaultCategoryId={questionModal?.categoryId ?? null}
        onClose={() => setQuestionModal(null)}
        onSave={saveQuestion}
      />

      <CategoryFormModal
        open={!!categoryModal}
        editTarget={categoryModal?.editTarget ?? null}
        rounds={hasRounds ? quiz.rounds : null}
        defaultRoundId={categoryModal?.roundId ?? null}
        onClose={() => setCategoryModal(null)}
        onSave={(input) => {
          const target = categoryModal?.editTarget;
          return target ? updateCategory(target.id, input) : addCategory(input);
        }}
      />

      <RoundFormModal
        open={!!roundModal}
        editTarget={roundModal?.editTarget ?? null}
        suggestedName={`Round ${quiz.rounds.length + 1}`}
        onClose={() => setRoundModal(null)}
        onSave={(input) => {
          const target = roundModal?.editTarget;
          return target ? updateRound(target.id, input) : addRound(input);
        }}
      />

      <ConfirmModal
        open={!!deleteTarget && !deleteHidden}
        title={
          deleteTarget?.kind === 'round'
            ? 'Delete Round'
            : deleteTarget?.kind === 'category'
              ? 'Delete Category'
              : 'Delete Question'
        }
        body={
          deleteTarget?.kind === 'round' ? (
            <>
              Are you sure you want to delete <strong>{deleteTarget.round.name}</strong>
              {contentsLabel(deleteTarget)}? This cannot be undone.
            </>
          ) : deleteTarget?.kind === 'category' ? (
            <>
              Are you sure you want to delete <strong>{deleteTarget.category.name}</strong>
              {contentsLabel(deleteTarget)}? This cannot be undone.
            </>
          ) : (
            <>
              Are you sure you want to delete question {deleteTarget?.number}? This cannot be
              undone.
            </>
          )
        }
        confirmLabel="Delete"
        confirmIcon="delete"
        intent="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
};

export default QuizDetailsPage;
