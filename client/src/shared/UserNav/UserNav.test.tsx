import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import UserNav from './UserNav';

const mockNavigate = jest.fn();
const mockMobileClose = jest.fn();
const mockLogout = jest.fn();

jest.mock('react-router-dom', () => ({
  useLocation: jest.fn(),
  useNavigate: () => mockNavigate,
}));

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ logout: mockLogout }),
}));

const setup = (pathname = '/dashboard', mobileOpen = false) => {
  (useLocation as jest.Mock).mockReturnValue({ pathname });

  return render(
    <UserNav
      mobileOpen={mobileOpen}
      onMobileClose={mockMobileClose}
    />,
  );
};

beforeEach(() => jest.clearAllMocks());

describe('UserNav', () => {
  it('names every page, and marks the current one', () => {
    setup('/quizzes/abc');

    expect(screen.getByRole('button', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Events' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quizzes' })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates and closes the mobile menu when an item is clicked', () => {
    setup('/dashboard', true);

    fireEvent.click(screen.getByRole('button', { name: 'Events' }));
    expect(mockNavigate).toHaveBeenCalledWith('/events');
    expect(mockMobileClose).toHaveBeenCalledTimes(1);
  });

  it('signs out and goes to the login page', async () => {
    mockLogout.mockResolvedValue(undefined);
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/login'));
    expect(mockLogout).toHaveBeenCalledTimes(1);
  });
});
