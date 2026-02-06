/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { AutopsyCard } from '../components/AutopsyCard';
import { BeforeAfterSlider } from '../components/BeforeAfterSlider';
import { FixRequestList } from '../components/FixRequestList';
import { HeatMapOverlay } from '../components/HeatMapOverlay';
import { PullRequestList } from '../components/PullRequestList';
import { VersionTimeline } from '../components/VersionTimeline';

describe('post detail UI', () => {
  test('version timeline updates selection', () => {
    render(<VersionTimeline versions={[1, 2, 3]} />);
    fireEvent.click(screen.getByRole('button', { name: /v2/i }));
    expect(screen.getByText(/Selected version: v2/i)).toBeInTheDocument();
  });

  test('before/after slider updates value', () => {
    render(<BeforeAfterSlider afterLabel="v2" beforeLabel="v1" />);
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: 70 } });
    expect(screen.getByText(/70%/i)).toBeInTheDocument();
  });

  test('before/after slider renders only before image when after is missing', () => {
    render(
      <BeforeAfterSlider
        afterLabel="v2"
        beforeImageUrl="/before.png"
        beforeLabel="v1"
      />,
    );
    expect(screen.getByRole('img', { name: /Before v1/i })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /After v2/i })).toBeNull();
  });

  test('before/after slider renders only after image when before is missing', () => {
    render(
      <BeforeAfterSlider
        afterImageUrl="/after.png"
        afterLabel="v2"
        beforeLabel="v1"
      />,
    );
    expect(screen.getByRole('img', { name: /After v2/i })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Before v1/i })).toBeNull();
  });

  test('before/after slider hides image grid when no images provided', () => {
    render(<BeforeAfterSlider afterLabel="v2" beforeLabel="v1" />);
    expect(screen.queryAllByRole('img').length).toBe(0);
  });

  test('fix request filter applies', () => {
    render(
      <FixRequestList
        items={[
          {
            id: '1',
            category: 'Focus',
            description: 'Adjust focus',
            critic: 'A',
          },
          {
            id: '2',
            category: 'Color/Light',
            description: 'Boost contrast',
            critic: 'B',
          },
        ]}
      />,
    );
    fireEvent.change(screen.getByDisplayValue('All'), {
      target: { value: 'Focus' },
    });
    expect(screen.getByText(/Adjust focus/i)).toBeInTheDocument();
  });

  test('pull request filter applies', () => {
    render(
      <PullRequestList
        items={[
          { id: '1', status: 'pending', description: 'Pending', maker: 'A' },
          { id: '2', status: 'merged', description: 'Merged', maker: 'B' },
        ]}
      />,
    );
    fireEvent.change(screen.getByDisplayValue('All'), {
      target: { value: 'merged' },
    });
    expect(screen.getAllByText(/Merged/i).length).toBeGreaterThan(0);
  });

  test('heat map toggles', () => {
    render(<HeatMapOverlay />);
    fireEvent.click(screen.getByRole('button', { name: /Hide/i }));
    expect(screen.getByText(/Heat map hidden/i)).toBeInTheDocument();
  });

  test('autopsy card renders published date when provided', () => {
    const publishedAt = new Date('2024-01-01T00:00:00Z').toISOString();
    render(
      <AutopsyCard id="auto-1" publishedAt={publishedAt} summary="Summary" />,
    );
    expect(
      screen.getByText(new Date(publishedAt).toLocaleString()),
    ).toBeInTheDocument();
  });

  test('autopsy card falls back to draft label without date', () => {
    render(<AutopsyCard id="auto-2" summary="Summary" />);
    expect(screen.getByText(/Draft/i)).toBeInTheDocument();
  });
});
