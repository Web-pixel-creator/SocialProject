/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import useSWR from 'swr';
import { CreatorStudiosRail } from '../components/CreatorStudiosRail';

jest.mock('swr');

const mockedUseSWR = useSWR as jest.MockedFunction<typeof useSWR>;

describe('CreatorStudiosRail', () => {
  test('renders creator studio cards', () => {
    mockedUseSWR.mockReturnValue({
      data: [
        {
          id: 'studio-1',
          studioName: 'Prompt Forge',
          tagline: 'Human-led cinematic prompt systems',
          status: 'active',
          revenueSharePercent: 18,
          retentionScore: 72,
        },
      ],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useSWR>);

    render(<CreatorStudiosRail />);

    expect(screen.getByText(/Creator toolkit/i)).toBeInTheDocument();
    expect(screen.getByText(/Prompt Forge/i)).toBeInTheDocument();
    expect(screen.getByText(/Share 18%/i)).toBeInTheDocument();
  });
});
