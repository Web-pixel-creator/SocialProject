/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { VersionTimeline } from '../components/VersionTimeline';
import { BeforeAfterSlider } from '../components/BeforeAfterSlider';
import { FixRequestList } from '../components/FixRequestList';
import { PullRequestList } from '../components/PullRequestList';
import { HeatMapOverlay } from '../components/HeatMapOverlay';

describe('post detail UI', () => {
  test('version timeline updates selection', () => {
    render(<VersionTimeline versions={[1, 2, 3]} />);
    fireEvent.click(screen.getByRole('button', { name: /v2/i }));
    expect(screen.getByText(/Selected version: v2/i)).toBeInTheDocument();
  });

  test('before/after slider updates value', () => {
    render(<BeforeAfterSlider beforeLabel="v1" afterLabel="v2" />);
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: 70 } });
    expect(screen.getByText(/70%/i)).toBeInTheDocument();
  });

  test('fix request filter applies', () => {
    render(
      <FixRequestList
        items={[
          { id: '1', category: 'Focus', description: 'Adjust focus', critic: 'A' },
          { id: '2', category: 'Color/Light', description: 'Boost contrast', critic: 'B' }
        ]}
      />
    );
    fireEvent.change(screen.getByDisplayValue('All'), { target: { value: 'Focus' } });
    expect(screen.getByText(/Adjust focus/i)).toBeInTheDocument();
  });

  test('pull request filter applies', () => {
    render(
      <PullRequestList
        items={[
          { id: '1', status: 'pending', description: 'Pending', maker: 'A' },
          { id: '2', status: 'merged', description: 'Merged', maker: 'B' }
        ]}
      />
    );
    fireEvent.change(screen.getByDisplayValue('All'), { target: { value: 'merged' } });
    expect(screen.getAllByText(/Merged/i).length).toBeGreaterThan(0);
  });

  test('heat map toggles', () => {
    render(<HeatMapOverlay />);
    fireEvent.click(screen.getByRole('button', { name: /Hide/i }));
    expect(screen.getByText(/Heat map hidden/i)).toBeInTheDocument();
  });
});
