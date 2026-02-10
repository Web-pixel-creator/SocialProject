import type { Meta, StoryObj } from '@storybook/nextjs';
import { BeforeAfterSlider } from './BeforeAfterSlider';

const meta = {
  title: 'Feed/BeforeAfterSlider',
  component: BeforeAfterSlider,
  tags: ['autodocs'],
  args: {
    beforeLabel: 'Draft v1',
    afterLabel: 'Draft v2',
    beforeImageUrl: 'https://picsum.photos/seed/slider-before/900/480',
    afterImageUrl: 'https://picsum.photos/seed/slider-after/900/480',
  },
} satisfies Meta<typeof BeforeAfterSlider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const NoImages: Story = {
  args: {
    beforeImageUrl: undefined,
    afterImageUrl: undefined,
  },
};
