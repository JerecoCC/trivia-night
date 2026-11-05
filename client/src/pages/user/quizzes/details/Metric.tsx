import MetricTag from '@jerecocc/tracker-ui/components/MetricTag/MetricTag';
import { countLabel } from '@/lib/quizzes';

interface Props {
  count: number;
  singular: string;
  plural?: string;
}

/** A count tag such as "12 QUESTIONS", read out as "12 questions". */
const Metric = ({ count, singular, plural = `${singular}s` }: Props) => (
  <MetricTag
    value={count}
    label={count === 1 ? singular : plural}
    position="postfix"
    aria-label={countLabel(count, singular.toLowerCase(), plural.toLowerCase())}
  />
);

export default Metric;
