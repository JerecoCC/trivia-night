import { render, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import PageTitle from './PageTitle';

jest.mock('react-router-dom', () => ({
  useLocation: jest.fn(),
}));

const setup = (pathname: string) => {
  (useLocation as jest.Mock).mockReturnValue({ pathname });
  return render(<PageTitle />);
};

describe('PageTitle', () => {
  it.each([
    ['/dashboard', 'Dashboard'],
    ['/events', 'Events'],
    ['/quizzes', 'Quizzes'],
    ['/quizzes/abc', 'Quiz'],
  ])('shows the title for %s', (pathname, title) => {
    setup(pathname);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  });

  it('renders no heading for an unmatched route', () => {
    setup('/unknown');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
