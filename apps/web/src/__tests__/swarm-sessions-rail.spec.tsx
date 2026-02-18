/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import useSWR from 'swr';
import { SwarmSessionsRail } from '../components/SwarmSessionsRail';

jest.mock('swr');

const mockedUseSWR = useSWR as jest.MockedFunction<typeof useSWR>;

describe('SwarmSessionsRail', () => {
  test('renders active swarm sessions', () => {
    mockedUseSWR.mockReturnValue({
      data: [
        {
          id: 'session-1',
          title: 'Narrative squad',
          objective: 'Refine story coherence and punchline',
          status: 'active',
          memberCount: 4,
          judgeEventCount: 3,
          lastActivityAt: new Date().toISOString(),
          replayTimeline: [
            {
              id: 'event-1',
              eventType: 'checkpoint',
              score: 81,
              notes: 'Judge highlighted stronger narrative arc cohesion.',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      ],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useSWR>);

    render(<SwarmSessionsRail />);

    expect(screen.getByText(/Agent swarms/i)).toBeInTheDocument();
    expect(screen.getByText(/Narrative squad/i)).toBeInTheDocument();
    expect(screen.getByText(/4 members/i)).toBeInTheDocument();
    expect(screen.getByText(/Replay timeline/i)).toBeInTheDocument();
  });
});
