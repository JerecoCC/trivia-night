import { Fragment, type ComponentProps } from 'react';
import Button from '@jerecocc/tracker-ui/components/Button/Button';
import Divider from '@jerecocc/tracker-ui/components/Divider/Divider';
import MoreActionsMenu from '@jerecocc/tracker-ui/components/MoreActionsMenu/MoreActionsMenu';
import { categoriesIn, questionsIn, type QuizCategory, type QuizRound } from '@/lib/quizzes';
import EmptyMessage from '@/shared/EmptyMessage/EmptyMessage';
import CategoryList from './CategoryList';
import Metric from './Metric';
import styles from './QuizDetails.module.scss';

type CategoryListProps = ComponentProps<typeof CategoryList>;

interface Props extends Omit<CategoryListProps, 'categories' | 'headingLevel'> {
  rounds: QuizRound[];
  /** Every category in the quiz, round by round. */
  categories: QuizCategory[];
  onMoveRound: (round: QuizRound, delta: -1 | 1) => void;
  onAddCategory: (round: QuizRound) => void;
  onEditRound: (round: QuizRound) => void;
  onDeleteRound: (round: QuizRound) => void;
}

/** Each round as a heading over its categories, with an intermission between rounds. */
const RoundList = (props: Props) => {
  const {
    rounds,
    categories,
    onMoveRound,
    onAddCategory,
    onEditRound,
    onDeleteRound,
    ...categoryListProps
  } = props;
  const { questions, reordering } = categoryListProps;

  return (
    <div className={styles.rounds}>
      {rounds.map((round, index) => {
        const roundCategories = categoriesIn(categories, round.id);
        const questionCount = roundCategories.reduce(
          (count, category) => count + questionsIn(questions, category.id).length,
          0,
        );
        return (
          <Fragment key={round.id}>
            {index > 0 && (
              <Divider
                text="Intermission"
                role="separator"
                aria-label="Intermission"
                className={styles.intermission}
              />
            )}
            <section
              className={styles.round}
              aria-label={round.name}
            >
              <header className={styles.roundHeader}>
                <h3 className={styles.roundName}>{round.name}</h3>
                <Metric
                  count={roundCategories.length}
                  singular="Category"
                  plural="Categories"
                />
                <Metric
                  count={questionCount}
                  singular="Question"
                />
                {!reordering && (
                  <div className={styles.roundActions}>
                    <Button
                      variant="outlined"
                      intent="accent"
                      icon="add"
                      size="small"
                      aria-label={`Add category to ${round.name}`}
                      onClick={() => onAddCategory(round)}
                    >
                      Add Category
                    </Button>
                    <MoreActionsMenu
                      size="small"
                      items={[
                        { label: 'Edit', icon: 'edit', onClick: () => onEditRound(round) },
                        {
                          label: 'Move Up',
                          icon: 'arrow_upward',
                          disabled: index === 0,
                          onClick: () => onMoveRound(round, -1),
                        },
                        {
                          label: 'Move Down',
                          icon: 'arrow_downward',
                          disabled: index === rounds.length - 1,
                          onClick: () => onMoveRound(round, 1),
                        },
                        {
                          label: 'Delete',
                          icon: 'delete',
                          intent: 'danger',
                          onClick: () => onDeleteRound(round),
                        },
                      ]}
                    />
                  </div>
                )}
              </header>
              {roundCategories.length === 0 ? (
                <EmptyMessage>No categories in this round yet.</EmptyMessage>
              ) : (
                <CategoryList
                  {...categoryListProps}
                  categories={roundCategories}
                  headingLevel={4}
                />
              )}
            </section>
          </Fragment>
        );
      })}
    </div>
  );
};

export default RoundList;
