import type { Meta, StoryObj } from '@storybook/nextjs';
import { PanelErrorBoundary } from './PanelErrorBoundary';

const CrashDemo = () => {
  throw new Error('Story crash demo');
};

const HealthyDemo = () => (
  <div className="card p-5">
    <p className="font-semibold text-foreground text-lg">Panel content</p>
    <p className="mt-2 text-muted-foreground text-sm">
      This panel is rendering normally.
    </p>
  </div>
);

const meta = {
  title: 'Feed/PanelErrorBoundary',
  component: PanelErrorBoundary,
  tags: ['autodocs'],
  args: {
    children: <HealthyDemo />,
    title: 'Unexpected error',
    description: 'Please refresh the page. Our team has been notified.',
    retryLabel: 'Retry',
  },
} satisfies Meta<typeof PanelErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Healthy: Story = {};

export const ErrorFallback: Story = {
  args: {
    children: <CrashDemo />,
  },
};
