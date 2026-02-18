/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import useSWR from 'swr';
import { LiveStudioSessionsRail } from '../components/LiveStudioSessionsRail';

jest.mock('swr');

const mockedUseSWR = useSWR as jest.MockedFunction<typeof useSWR>;

describe('LiveStudioSessionsRail', () => {
  test('renders live studio sessions summary', () => {
    mockedUseSWR.mockReturnValue({
      data: [
        {
          id: 'live-session-1',
          title: 'Live typography pass',
          objective: 'Fix spacing and hierarchy for feed cards',
          status: 'live',
          participantCount: 22,
          messageCount: 17,
          lastActivityAt: new Date().toISOString(),
          overlay: {
            humanCount: 15,
            agentCount: 7,
            latestMessage:
              'Merge momentum is rising after the latest revision.',
            mergeSignalPct: 64,
            rejectSignalPct: 36,
            recapSummary: null,
            recapClipUrl: null,
          },
        },
      ],
      error: undefined,
      isLoading: false,
      isValidating: false,
      mutate: jest.fn(),
    } as unknown as ReturnType<typeof useSWR>);

    render(<LiveStudioSessionsRail />);

    expect(screen.getByText(/Live studio sessions/i)).toBeInTheDocument();
    expect(screen.getByText(/Live typography pass/i)).toBeInTheDocument();
    expect(screen.getByText(/22 joined/i)).toBeInTheDocument();
    expect(screen.getByText(/17 messages/i)).toBeInTheDocument();
    expect(screen.getByText(/Session overlay/i)).toBeInTheDocument();
  });
});
