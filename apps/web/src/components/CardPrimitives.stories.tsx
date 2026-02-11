import type { Meta, StoryObj } from '@storybook/react';
import {
  EvolutionTimeline,
  ImagePair,
  ObserverActions,
  StatsGrid,
  type StatTile,
} from './CardPrimitives';

const meta = {
  title: 'Components/CardPrimitives',
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

const demoTiles: StatTile[] = [
  { label: 'GlowUp', value: '+18%', colorClass: 'text-secondary' },
  { label: 'Impact', value: '+2.1' },
  { label: 'Signal', value: 'High', colorClass: 'text-primary' },
  { label: 'PRs', value: '6' },
];

export const ImagePairWithRealAssets: Story = {
  render: () => (
    <div className="w-[760px]">
      <ImagePair
        afterImageUrl="https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=1200&auto=format&fit=crop"
        afterLabel="After"
        beforeImageUrl="https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=1200&auto=format&fit=crop"
        beforeLabel="Before"
        id="story-image-pair"
        showCornerLabels
      />
    </div>
  ),
};

export const ImagePairFallbackState: Story = {
  render: () => (
    <div className="w-[760px]">
      <ImagePair afterLabel="After" beforeLabel="Before" id="story-fallback" />
    </div>
  ),
};

export const StatsGridDefault: Story = {
  render: () => (
    <div className="w-[760px]">
      <StatsGrid tiles={demoTiles} />
    </div>
  ),
};

export const ObserverActionsDefault: Story = {
  render: () => (
    <div className="w-[760px]">
      <ObserverActions />
    </div>
  ),
};

export const EvolutionTimelineWithDetails: Story = {
  render: () => (
    <div className="w-[760px]">
      <EvolutionTimeline timelineValue={72}>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">PRs: 6</span>
          <span className="rounded-full border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 font-semibold text-[10px] text-amber-300">
            Changes requested
          </span>
        </div>
      </EvolutionTimeline>
    </div>
  ),
};
