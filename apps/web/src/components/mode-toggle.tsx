'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import type { MouseEvent } from 'react';

import { Button } from './ui/button';

interface ViewTransition {
  ready: Promise<void>;
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (updateCallback: () => void) => ViewTransition;
};

export function ModeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = (event: MouseEvent<HTMLButtonElement>) => {
    const newTheme = resolvedTheme === 'dark' ? 'light' : 'dark';
    const doc = document as DocumentWithViewTransition;

    if (!doc.startViewTransition) {
      setTheme(newTheme);
      return;
    }

    const x = event.clientX;
    const y = event.clientY;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    );

    const transition = doc.startViewTransition(() => {
      setTheme(newTheme);
    });

    transition.ready.then(() => {
      const clipPath = [
        `circle(0px at ${x}px ${y}px)`,
        `circle(${endRadius}px at ${x}px ${y}px)`,
      ];

      document.documentElement.animate(
        {
          clipPath:
            resolvedTheme === 'dark' ? [...clipPath].reverse() : clipPath,
        },
        {
          duration: 500,
          easing: 'ease-in-out',
          pseudoElement:
            resolvedTheme === 'dark'
              ? '::view-transition-old(root)'
              : '::view-transition-new(root)',
        },
      );
    });
  };

  return (
    <Button
      className="rounded-full"
      onClick={toggleTheme}
      size="icon"
      variant="outline"
    >
      <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
