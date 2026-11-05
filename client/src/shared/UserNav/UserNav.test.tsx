import { fireEvent, render, screen } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import UserNav from './UserNav';

const mockNavigate = jest.fn();
const mockMobileClose = jest.fn();

jest.mock('react-router-dom', () => ({
  useLocation: jest.fn(),
  useNavigate: () => mockNavigate,
}));

const setup = () => {
  (useLocation as jest.Mock).mockReturnValue({ pathname: '/dashboard' });

  return render(
    <UserNav
      collapsed={false}
      onToggle={jest.fn()}
      mobileOpen
      onMobileClose={mockMobileClose}
    />,
  );
};

beforeEach(() => jest.clearAllMocks());

describe('UserNav', () => {
  it('leads with the app icon and name, and only the icon when collapsed', () => {
    const { container, rerender } = setup();

    expect(screen.getByText('Trivia Night')).toBeInTheDocument();
    expect(container.querySelector('img[src="/favicon.svg"]')).toHaveAttribute('alt', '');

    rerender(
      <UserNav
        collapsed
        onToggle={jest.fn()}
        mobileOpen={false}
        onMobileClose={mockMobileClose}
      />,
    );
    expect(screen.queryByText('Trivia Night')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Trivia Night' })).toHaveAttribute(
      'src',
      '/favicon.svg',
    );
  });

  it('navigates and closes the mobile menu when an item is clicked', () => {
    setup();

    fireEvent.click(screen.getByRole('button', { name: 'Dashboard' }));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
    expect(mockMobileClose).toHaveBeenCalledTimes(1);
  });
});
