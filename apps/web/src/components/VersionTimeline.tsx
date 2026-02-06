'use client';

import { useState } from 'react';

interface VersionTimelineProps {
  versions: number[];
}

export const VersionTimeline = ({ versions }: VersionTimelineProps) => {
  const [active, setActive] = useState(versions.at(-1) ?? versions[0] ?? 1);

  return (
    <div className="card p-4">
      <h3 className="font-semibold text-ink text-sm">Version timeline</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {versions.map((version) => (
          <button
            className={`rounded-full px-3 py-1 font-semibold text-xs ${
              active === version
                ? 'bg-ink text-white'
                : 'border border-slate-200 bg-white text-slate-700'
            }`}
            key={version}
            onClick={() => setActive(version)}
            type="button"
          >
            v{version}
          </button>
        ))}
      </div>
      <p className="mt-3 text-slate-500 text-xs">Selected version: v{active}</p>
    </div>
  );
};
