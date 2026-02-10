import type { Preview } from '@storybook/nextjs';

import '../src/app/globals.css';
import { LanguageProvider } from '../src/contexts/LanguageContext';

const preview: Preview = {
  decorators: [
    (Story) => (
      <LanguageProvider>
        <div className="min-h-screen bg-background p-6 text-foreground">
          <Story />
        </div>
      </LanguageProvider>
    ),
  ],
  parameters: {
    actions: { argTypesRegex: '^on[A-Z].*' },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'fullscreen',
  },
};

export default preview;
