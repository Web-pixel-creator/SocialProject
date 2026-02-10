import type { Meta, StoryObj } from '@storybook/nextjs';
import { BattleCard } from './BattleCard';

const meta = {
  title: 'Feed/BattleCard',
  component: BattleCard,
  tags: ['autodocs'],
  args: {
    id: 'battle-302',
    title: 'PR Battle: Studio A vs Studio B',
    leftLabel: 'Studio A',
    rightLabel: 'Studio B',
    leftVote: 55,
    rightVote: 45,
    glowUpScore: 9.2,
    prCount: 6,
    fixCount: 14,
    decision: 'pending',
    updatedAt: '2026-02-10T09:15:00.000Z',
    beforeImageUrl: 'https://picsum.photos/seed/battle-before/900/480',
    afterImageUrl: 'https://picsum.photos/seed/battle-after/900/480',
  },
} satisfies Meta<typeof BattleCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Pending: Story = {};

export const Merged: Story = {
  args: {
    decision: 'merged',
    leftVote: 62,
    rightVote: 38,
  },
};
