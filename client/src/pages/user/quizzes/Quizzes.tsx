import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '@jerecocc/tracker-ui/components/Button/Button';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faClipboardQuestion } from '@fortawesome/free-solid-svg-icons';
import ListItem, { type ListItemAction } from '@jerecocc/tracker-ui/components/ListItem/ListItem';
import Section from '@jerecocc/tracker-ui/components/Section/Section';
import useBackgroundModalAction from '@/hooks/useBackgroundModalAction';
import useQuizzes from '@/hooks/useQuizzes';
import { STRUCTURE_LABELS, quizCountsLabel, type QuizInput, type QuizSummary } from '@/lib/quizzes';
import EmptyMessage from '@/shared/EmptyMessage/EmptyMessage';
import ResponsiveList from '@/shared/ResponsiveList/ResponsiveList';
import QuizDeleteModal from './QuizDeleteModal';
import QuizFormModal from './QuizFormModal';
import styles from './Quizzes.module.scss';

const QuizzesPage = () => {
  const navigate = useNavigate();
  const { quizzes, loading, busy, addQuiz, updateQuiz, deleteQuiz } = useQuizzes();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<QuizSummary | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<QuizSummary | null>(null);

  const openCreate = () => {
    setEditTarget(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditTarget(null);
  };

  // A new quiz opens straight away so the planner can start adding questions.
  const saveQuiz = async (input: QuizInput) => {
    if (editTarget) return updateQuiz(editTarget.id, input);
    const created = await addQuiz(input);
    if (created) navigate(`/quizzes/${created.id}`);
    return !!created;
  };

  const { hidden: deleteHidden, runSettled: runDelete } = useBackgroundModalAction({
    target: confirmDelete?.id ?? null,
    onDone: () => setConfirmDelete(null),
  });

  return (
    <>
      <Section
        title="Quizzes"
        action={
          <Button
            icon="add"
            size="medium"
            onClick={openCreate}
          >
            Create Quiz
          </Button>
        }
      >
        {loading ? (
          <EmptyMessage>Loading...</EmptyMessage>
        ) : quizzes.length === 0 ? (
          <EmptyMessage>No quizzes yet. Create one, then add it to an event.</EmptyMessage>
        ) : (
          <ResponsiveList>
            {quizzes.map((quiz) => (
              <ListItem
                key={quiz.id}
                fullWidth
                href={`/quizzes/${quiz.id}`}
                imageNode={
                  <span
                    className={styles.quizIcon}
                    aria-hidden="true"
                  >
                    <FontAwesomeIcon
                      icon={faClipboardQuestion}
                      style={{ fontSize: '1.3rem' }}
                    />
                  </span>
                }
                name={quiz.name}
                subtitle={quizCountsLabel(quiz)}
                rightContent={{
                  type: 'tag',
                  label: STRUCTURE_LABELS[quiz.structure],
                  intent: 'neutral',
                }}
                actions={
                  [
                    {
                      icon: 'edit',
                      intent: 'accent',
                      tooltip: 'Edit',
                      disabled: busy === quiz.id,
                      onClick: () => {
                        setEditTarget(quiz);
                        setModalOpen(true);
                      },
                    },
                    {
                      icon: 'delete',
                      intent: 'danger',
                      tooltip: 'Delete',
                      disabled: busy === quiz.id,
                      onClick: () => setConfirmDelete(quiz),
                    },
                  ] satisfies ListItemAction[]
                }
              />
            ))}
          </ResponsiveList>
        )}
      </Section>

      <QuizDeleteModal
        open={!!confirmDelete && !deleteHidden}
        busy={!!confirmDelete && busy === confirmDelete.id}
        target={confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return;
          const { id } = confirmDelete;
          void runDelete(() => deleteQuiz(id), { pending: 'Deleting quiz…' });
        }}
      />

      <QuizFormModal
        open={modalOpen}
        editTarget={editTarget}
        onClose={closeModal}
        onSave={saveQuiz}
      />
    </>
  );
};

export default QuizzesPage;
