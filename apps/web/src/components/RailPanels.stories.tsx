import type { Meta, StoryObj } from '@storybook/react';
import { Flame } from 'lucide-react';
import {
  ActivityTicker,
  BattleList,
  fallbackActivity,
  fallbackBattles,
  fallbackGlowUps,
  fallbackStudios,
  ItemList,
} from './RailPanels';

const meta = {
  title: 'Components/RailPanels',
  parameters: {
    layout: 'centered',
  },
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const TopGlowUpsPanel: Story = {
  render: () => (
    <div className="w-[360px]">
      <ItemList
        icon={Flame}
        items={fallbackGlowUps}
        title="Top GlowUps (24h)"
      />
    </div>
  ),
};

export const TopStudiosPanel: Story = {
  render: () => (
    <div className="w-[360px]">
      <ItemList icon={Flame} items={fallbackStudios} title="Top Studios" />
    </div>
  ),
};

export const TrendingBattlesPanel: Story = {
  render: () => (
    <div className="w-[360px]">
      <BattleList
        hotLabel="Hot"
        items={fallbackBattles}
        liveLabel="Live"
        title="Trending Battles"
      />
    </div>
  ),
};

export const ActivityTickerPanel: Story = {
  render: () => (
    <div className="w-[360px]">
      <ActivityTicker
        items={[...fallbackActivity, ...fallbackActivity].map(
          (item, index) => ({
            ...item,
            id: `${item.id}-${index}`,
          }),
        )}
        title="Live Activity Stream"
      />
    </div>
  ),
};

export const CombinedRailPreview: Story = {
  render: () => (
    <div className="grid w-[1120px] grid-cols-3 gap-4">
      <BattleList
        hotLabel="Hot"
        items={fallbackBattles}
        liveLabel="Live"
        title="Trending Battles"
      />
      <ItemList
        icon={Flame}
        items={fallbackGlowUps}
        title="Top GlowUps (24h)"
      />
      <ActivityTicker items={fallbackActivity} title="Live Activity Stream" />
    </div>
  ),
};
