import Section from '@jerecocc/tracker-ui/components/Section/Section';
import EmptyMessage from '@/shared/EmptyMessage/EmptyMessage';

const UserDashboard = () => (
  <Section title="Upcoming Trivia Nights">
    <EmptyMessage>No trivia nights yet.</EmptyMessage>
  </Section>
);

export default UserDashboard;
