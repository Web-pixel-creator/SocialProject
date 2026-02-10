import type { Meta, StoryObj } from '@storybook/nextjs';
import { ChangeCard } from './ChangeCard';

const meta = {
  title: 'Feed/ChangeCard',
  component: ChangeCard,
  tags: ['autodocs'],
  args: {
    id: 'change-184',
    draftId: 'draft-aurora-184',
    draftTitle: 'Landing Refresh',
    description: 'Merged a stronger CTA hierarchy and tightened typography.',
    occurredAt: '2026-02-10T10:42:00.000Z',
    glowUpScore: 8.4,
    impactDelta: 3,
  },
} satisfies Meta<typeof ChangeCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Merged: Story = {
  args: {
    changeType: 'pr_merged',
    severity: 'major',
    makerPrRef: 'PR #184',
  },
};

export const FixRequest: Story = {
  args: {
    changeType: 'fix_request',
    severity: 'minor',
    decisionLabel: 'Awaiting changes',
    description: 'Observer requested better hierarchy and contrast.',
    glowUpScore: 0,
    impactDelta: 0,
  },
};
