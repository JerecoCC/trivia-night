import Accordion from '@jerecocc/tracker-ui/components/Accordion/Accordion';
import Button from '@jerecocc/tracker-ui/components/Button/Button';
import MoreActionsMenu from '@jerecocc/tracker-ui/components/MoreActionsMenu/MoreActionsMenu';
import Tag from '@jerecocc/tracker-ui/components/Tag/Tag';
import {
  QUESTION_TYPE_LABELS,
  questionsIn,
  type QuizCategory,
  type QuizQuestion,
} from '@/lib/quizzes';
import EmptyMessage from '@/shared/EmptyMessage/EmptyMessage';
import Metric from './Metric';
import { QuestionList, ReorderQuestionList } from './QuestionList';
import styles from './QuizDetails.module.scss';

interface Props {
  categories: QuizCategory[];
  questions: QuizQuestion[];
  /** h3 on its own, h4 under a round's heading. */
  headingLevel?: 3 | 4;
  /** In reorder mode, each category's questions can be dragged into a new order. */
  reordering: boolean;
  onMoveCategory: (category: QuizCategory, delta: -1 | 1) => void;
  onSaveQuestionOrder: (categoryId: string, questionIds: string[]) => Promise<unknown>;
  onAddQuestion: (category: QuizCategory) => void;
  onEdit: (category: QuizCategory) => void;
  onDelete: (category: QuizCategory) => void;
  onEditQuestion: (question: QuizQuestion) => void;
  onDeleteQuestion: (question: QuizQuestion) => void;
}

/** Each category as an accordion over its questions, numbered from 1 within the category. */
const CategoryList = (props: Props) => {
  const {
    categories,
    questions,
    headingLevel = 3,
    reordering,
    onMoveCategory,
    onSaveQuestionOrder,
    onAddQuestion,
    onEdit,
    onDelete,
    onEditQuestion,
    onDeleteQuestion,
  } = props;

  const Heading = headingLevel === 4 ? 'h4' : 'h3';

  return (
    <div className={styles.categories}>
      {categories.map((category, index) => {
        const categoryQuestions = questionsIn(questions, category.id);
        return (
          <Accordion
            key={category.id}
            role="region"
            aria-label={category.name}
            variant="light"
            // Reorder mode drags questions within each category, so all of them stay open.
            open={reordering ? true : undefined}
            disabled={reordering}
            className={{ header: styles.categoryHeader, body: styles.categoryBody }}
            label={
              <div className={styles.categoryLabel}>
                <Heading className={styles.categoryName}>{category.name}</Heading>
                <Metric
                  count={categoryQuestions.length}
                  singular="Question"
                />
                <Tag
                  label={QUESTION_TYPE_LABELS[category.question_type]}
                  intent="neutral"
                  variant="outlined"
                />
              </div>
            }
            headerRight={
              reordering ? undefined : (
                <>
                  <Button
                    variant="outlined"
                    intent="accent"
                    icon="add"
                    size="small"
                    aria-label={`Add question to ${category.name}`}
                    onClick={() => onAddQuestion(category)}
                  >
                    Add Question
                  </Button>
                  <MoreActionsMenu
                    size="small"
                    items={[
                      { label: 'Edit', icon: 'edit', onClick: () => onEdit(category) },
                      {
                        label: 'Move Up',
                        icon: 'arrow_upward',
                        disabled: index === 0,
                        onClick: () => onMoveCategory(category, -1),
                      },
                      {
                        label: 'Move Down',
                        icon: 'arrow_downward',
                        disabled: index === categories.length - 1,
                        onClick: () => onMoveCategory(category, 1),
                      },
                      {
                        label: 'Delete',
                        icon: 'delete',
                        intent: 'danger',
                        onClick: () => onDelete(category),
                      },
                    ]}
                  />
                </>
              )
            }
          >
            {categoryQuestions.length === 0 ? (
              <EmptyMessage>No questions in this category yet.</EmptyMessage>
            ) : reordering ? (
              <ReorderQuestionList
                questions={categoryQuestions}
                onSaveOrder={(ids) => onSaveQuestionOrder(category.id, ids)}
              />
            ) : (
              <QuestionList
                questions={categoryQuestions}
                categoryType={category.question_type}
                onEdit={onEditQuestion}
                onDelete={onDeleteQuestion}
              />
            )}
          </Accordion>
        );
      })}
    </div>
  );
};

export default CategoryList;
