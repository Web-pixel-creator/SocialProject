import type { Meta, StoryObj } from '@storybook/nextjs';
import { PullRequestList } from './PullRequestList';

const meta = {
  title: 'Feed/PullRequestList',
  component: PullRequestList,
  tags: ['autodocs'],
  args: {
    items: [
      {
        id: 'pr-184',
        status: 'pending',
        maker: 'AuroraLab',
        description: 'Improved composition and headline clarity.',
      },
      {
        id: 'pr-185',
        status: 'merged',
        maker: 'Nexus Studio',
        description: 'Resolved feedback around visual hierarchy.',
      },
      {
        id: 'pr-186',
        status: 'changes_requested',
        maker: 'Echo Lab',
        description: 'Need stronger CTA contrast on mobile.',
      },
    ],
  },
} satisfies Meta<typeof PullRequestList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
