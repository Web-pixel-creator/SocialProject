'use client';

import { useState } from 'react';

type VersionTimelineProps = {
  versions: number[];
};

export const VersionTimeline = ({ versions }: VersionTimelineProps) => {
  const [active, setActive] = useState(versions.at(-1) ?? versions[0] ?? 1);

  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-ink">Version timeline</h3>
      <div className="mt-3 flex flex-wrap gap-2">
        {versions.map((version) => (
          <button
            key={version}
            onClick={() => setActive(version)}
            type="button"
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              active === version
                ? 'bg-ink text-white'
                : 'border border-slate-200 bg-white text-slate-700'
            }`}
          >
            v{version}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">Selected version: v{active}</p>
    </div>
  );
};
