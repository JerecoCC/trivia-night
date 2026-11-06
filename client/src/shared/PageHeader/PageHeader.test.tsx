import { fireEvent, render, screen } from '@testing-library/react';
import { useAuth } from '@/context/AuthContext';
import PageHeader from './PageHeader';

jest.mock('../../context/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const plainUser = { display_name: 'Jane Planner', role: 'user' as const, photo: '' };
const photoUser = {
  display_name: 'Pete Photo',
  role: 'user' as const,
  photo: 'https://example.com/avatar.jpg',
};

const setup = (user: object | null = plainUser, onMenuToggle?: () => void) => {
  (useAuth as jest.Mock).mockReturnValue({ user });
  return render(<PageHeader onMenuToggle={onMenuToggle} />);
};

beforeEach(() => jest.clearAllMocks());

describe('PageHeader', () => {
  it('shows the app name', () => {
    setup();
    expect(screen.getByText('Trivia Night')).toBeInTheDocument();
  });

  it('shows who is signed in, with their initials when they have no photo', () => {
    setup();
    expect(screen.getByText('Jane Planner')).toBeInTheDocument();
    expect(screen.getByText('JP')).toBeInTheDocument();
  });

  it('shows their photo when they have one', () => {
    const { container } = setup(photoUser);
    expect(container.querySelector('img[src="https://example.com/avatar.jpg"]')).not.toBeNull();
    expect(screen.queryByText('PP')).not.toBeInTheDocument();
  });

  it('falls back to displayName when display_name is undefined', () => {
    setup({ displayName: 'Fallback Name', role: 'user', photo: '' });
    expect(screen.getByText('FN')).toBeInTheDocument();
    expect(screen.getByText('Fallback Name')).toBeInTheDocument();
  });

  it('shows no profile when nobody is signed in', () => {
    setup(null);
    expect(screen.queryByText('JP')).not.toBeInTheDocument();
  });

  it('opens the navigation from the menu button', () => {
    const onMenuToggle = jest.fn();
    setup(plainUser, onMenuToggle);

    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(onMenuToggle).toHaveBeenCalledTimes(1);
  });
});
