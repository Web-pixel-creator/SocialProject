/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PrivacyPage from '../app/privacy/page';
import { apiClient } from '../lib/api';

const useAuthMock = jest.fn(() => ({
  isAuthenticated: true,
  loading: false,
}));

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => useAuthMock(),
}));

jest.mock('../lib/api', () => ({
  apiClient: {
    get: jest.fn(() =>
      Promise.resolve({
        data: {
          id: 'export-1',
          status: 'ready',
          downloadUrl: 'https://example.com/export.zip',
        },
      }),
    ),
    post: jest.fn(() =>
      Promise.resolve({
        data: {
          export: {
            id: 'export-1',
            status: 'ready',
            downloadUrl: 'https://example.com/export.zip',
          },
        },
      }),
    ),
  },
  setAuthToken: jest.fn(),
}));

describe('privacy UI', () => {
  beforeEach(() => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      loading: false,
    });
    localStorage.clear();
    (apiClient.get as jest.Mock).mockReset();
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        id: 'export-1',
        status: 'ready',
        downloadUrl: 'https://example.com/export.zip',
      },
    });
    (apiClient.post as jest.Mock).mockReset();
    (apiClient.post as jest.Mock).mockImplementation((url: string) => {
      if (url === '/account/export') {
        return Promise.resolve({
          data: {
            export: {
              id: 'export-1',
              status: 'ready',
              downloadUrl: 'https://example.com/export.zip',
            },
          },
        });
      }
      if (url === '/account/delete') {
        return Promise.resolve({
          data: { status: 'completed' },
        });
      }
      return Promise.resolve({ data: {} });
    });
  });

  test('requests export and deletion', async () => {
    render(<PrivacyPage />);
    fireEvent.click(screen.getByRole('button', { name: /Request export/i }));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalled());
    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith('/account/exports/export-1'),
    );
    expect(await screen.findByText(/Requested/i)).toBeInTheDocument();
    expect(await screen.findByText(/Download export/i)).toHaveAttribute(
      'href',
      'https://example.com/export.zip',
    );

    fireEvent.click(screen.getByRole('button', { name: /Request deletion/i }));
    await waitFor(() =>
      expect(screen.getByText(/Pending/i)).toBeInTheDocument(),
    );
  });

  test('shows export error', async () => {
    (apiClient.post as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Export failed' } },
    });

    render(<PrivacyPage />);
    fireEvent.click(screen.getByRole('button', { name: /Request export/i }));

    expect(await screen.findByText(/Export failed/i)).toBeInTheDocument();
  });

  test('shows deletion error', async () => {
    (apiClient.post as jest.Mock)
      .mockResolvedValueOnce({
        data: {
          export: { id: 'export-2', status: 'ready', downloadUrl: null },
        },
      })
      .mockRejectedValueOnce({
        response: { data: { message: 'Deletion failed' } },
      });

    render(<PrivacyPage />);
    fireEvent.click(screen.getByRole('button', { name: /Request export/i }));

    fireEvent.click(screen.getByRole('button', { name: /Request deletion/i }));

    expect(await screen.findByText(/Deletion failed/i)).toBeInTheDocument();
  });

  test('restores stored export status and supports resync', async () => {
    localStorage.setItem('finishit-privacy-export-id', 'export-stored');
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        id: 'export-stored',
        status: 'ready',
        downloadUrl: 'https://example.com/export-stored.zip',
      },
    });

    render(<PrivacyPage />);

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        '/account/exports/export-stored',
      ),
    );
    expect(await screen.findByText(/Download export/i)).toHaveAttribute(
      'href',
      'https://example.com/export-stored.zip',
    );

    fireEvent.click(screen.getByRole('button', { name: /Resync now/i }));
    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        '/account/exports/export-stored',
      ),
    );
  });

  test('keeps last successful export state when resync fails', async () => {
    localStorage.setItem('finishit-privacy-export-id', 'export-stable');
    (apiClient.get as jest.Mock).mockResolvedValue({
      data: {
        id: 'export-stable',
        status: 'ready',
        downloadUrl: 'https://example.com/export-stable.zip',
      },
    });

    render(<PrivacyPage />);

    await waitFor(() =>
      expect(apiClient.get).toHaveBeenCalledWith(
        '/account/exports/export-stable',
      ),
    );
    expect(await screen.findByText(/Download export/i)).toHaveAttribute(
      'href',
      'https://example.com/export-stable.zip',
    );

    (apiClient.get as jest.Mock).mockRejectedValueOnce({
      response: { data: { message: 'Status reload failed' } },
    });

    fireEvent.click(screen.getByRole('button', { name: /Resync now/i }));

    expect(
      await screen.findByText(/Status reload failed/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Download export/i)).toHaveAttribute(
      'href',
      'https://example.com/export-stable.zip',
    );
  });

  test('shows sign-in prompt when user is not authenticated', () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      loading: false,
    });

    render(<PrivacyPage />);

    expect(
      screen.getAllByRole('link', { name: /Sign in/i }).at(0),
    ).toHaveAttribute('href', '/login');
    fireEvent.click(screen.getByRole('button', { name: /Request export/i }));
    expect(apiClient.post).not.toHaveBeenCalled();
  });

  test('renders compact status pills for export and deletion', () => {
    render(<PrivacyPage />);

    expect(screen.getByText(/Data export:\s*Pending/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Account deletion:\s*Pending/i),
    ).toBeInTheDocument();
  });
});
