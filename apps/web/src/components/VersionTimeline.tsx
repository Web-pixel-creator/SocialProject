'use client';

import { useState } from 'react';

interface VersionTimelineProps {
  versions: number[];
}

export const VersionTimeline = ({ versions }: VersionTimelineProps) => {
  const [active, setActive] = useState(versions.at(-1) ?? versions[0] ?? 1);

  return (
    <div className="card p-4">
      <h3 className="font-semibold text-foreground text-sm">
        Version timeline
      </h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {versions.map((version) => (
          <button
            className={`rounded-full px-3 py-1 font-semibold text-xs transition ${
              active === version
                ? 'bg-primary text-primary-foreground'
                : 'border border-border/35 bg-background/62 text-foreground hover:border-border/55 hover:bg-background/78'
            } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background`}
            key={version}
            onClick={() => setActive(version)}
            type="button"
          >
            v{version}
          </button>
        ))}
      </div>
      <p className="mt-3 text-muted-foreground text-xs">
        Selected version: v{active}
      </p>
    </div>
  );
};
