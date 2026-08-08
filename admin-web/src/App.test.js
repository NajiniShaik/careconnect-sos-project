import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Login from './pages/Login';
import { loginUser } from './api/authApi';

jest.mock('./api/authApi', () => ({
  loginUser: jest.fn(),
}));

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  Link: ({ children, to }) => <a href={to}>{children}</a>,
}));

describe('Login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  test('clears a pending redirect when the login component unmounts', async () => {
    loginUser.mockResolvedValue({
      data: {
        access: 'access-token',
        refresh: 'refresh-token',
        user: { role: 'ADMIN' },
      },
    });

    const { unmount } = render(<Login />);

    fireEvent.change(screen.getByPlaceholderText(/email/i), { target: { value: 'admin@example.com' } });
    fireEvent.change(screen.getByPlaceholderText(/password/i), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() => expect(loginUser).toHaveBeenCalled());

    unmount();
    jest.advanceTimersByTime(500);

    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
