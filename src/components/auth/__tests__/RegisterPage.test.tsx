import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RegisterPage } from '../RegisterPage';

describe('RegisterPage Component Tests (Fast UI Validation)', () => {
  const mockOnRegister = vi.fn();
  const mockOnNavigateToLogin = vi.fn();

  it('renders registration form elements correctly', () => {
    render(
      <RegisterPage
        onRegister={mockOnRegister}
        onNavigateToLogin={mockOnNavigateToLogin}
      />
    );

    expect(screen.getByRole('heading', { name: 'Create Account' })).toBeInTheDocument();
    expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('shows error when submitting empty fields', async () => {
    render(
      <RegisterPage
        onRegister={mockOnRegister}
        onNavigateToLogin={mockOnNavigateToLogin}
      />
    );

    fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!);

    expect(await screen.findByText('Please fill in all fields')).toBeInTheDocument();
    expect(mockOnRegister).not.toHaveBeenCalled();
  });

  it('shows error when submitting invalid email address', async () => {
    render(
      <RegisterPage
        onRegister={mockOnRegister}
        onNavigateToLogin={mockOnNavigateToLogin}
      />
    );

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'invalidemail' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'TestPassword123!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'TestPassword123!' } });

    fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!);

    expect(await screen.findByText('Please enter a valid email address')).toBeInTheDocument();
    expect(mockOnRegister).not.toHaveBeenCalled();
  });

  it('shows error when passwords do not match', async () => {
    render(
      <RegisterPage
        onRegister={mockOnRegister}
        onNavigateToLogin={mockOnNavigateToLogin}
      />
    );

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'TestPassword123!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'DifferentPassword' } });

    fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!);

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(mockOnRegister).not.toHaveBeenCalled();
  });

  it('calls onRegister and shows success screen upon successful submission', async () => {
    mockOnRegister.mockResolvedValueOnce(undefined);

    render(
      <RegisterPage
        onRegister={mockOnRegister}
        onNavigateToLogin={mockOnNavigateToLogin}
      />
    );

    fireEvent.change(screen.getByLabelText(/email address/i), { target: { value: 'test@example.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'TestPassword123!' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'TestPassword123!' } });

    fireEvent.submit(screen.getByRole('button', { name: /create account/i }).closest('form')!);

    await waitFor(() => {
      expect(mockOnRegister).toHaveBeenCalledWith('test@example.com', 'TestPassword123!', 'TestPassword123!');
    });

    expect(await screen.findByText('Check Your Email')).toBeInTheDocument();
    expect(screen.getByText('test@example.com')).toBeInTheDocument();
  });
});
