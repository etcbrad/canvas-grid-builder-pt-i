import React from 'react';

export interface OnionSkinConfig {
  past: number;
  future: number;
  enabled: boolean;
}

export interface OnionSkinControlsProps {
  config: OnionSkinConfig;
  onConfigChange: (config: OnionSkinConfig) => void;
}

const OnionSkinControls: React.FC<OnionSkinControlsProps> = ({ config, onConfigChange }) => {
  return (
    <div className="flex flex-col gap-2 min-w-[160px] p-2 border border-zinc-700 rounded bg-zinc-900/95">
      <div className="text-[8px] font-bold font-mono text-zinc-500 tracking-wider uppercase">
        Onion Skin
      </div>
      <button
        onClick={() => onConfigChange({ ...config, enabled: !config.enabled })}
        className={`px-2 py-1 text-[9px] border rounded transition-colors ${
          config.enabled
            ? 'bg-emerald-900/50 border-emerald-600 text-emerald-300'
            : 'bg-zinc-950 border-zinc-700 text-zinc-500'
        }`}
      >
        {config.enabled ? 'ON' : 'OFF'}
      </button>
      {config.enabled && (
        <>
          <div>
            <label className="flex justify-between items-center text-[9px] text-zinc-400">
              <span>Past</span>
              <span className="font-bold text-emerald-400">{config.past}</span>
            </label>
            <input
              type="range"
              min={0}
              max={5}
              value={config.past}
              onChange={(e) =>
                onConfigChange({ ...config, past: Number(e.target.value) })
              }
              className="w-full h-1.5 accent-emerald-500 bg-zinc-800 rounded"
            />
          </div>
          <div>
            <label className="flex justify-between items-center text-[9px] text-zinc-400">
              <span>Future</span>
              <span className="font-bold text-purple-400">{config.future}</span>
            </label>
            <input
              type="range"
              min={0}
              max={5}
              value={config.future}
              onChange={(e) =>
                onConfigChange({ ...config, future: Number(e.target.value) })
              }
              className="w-full h-1.5 accent-purple-500 bg-zinc-800 rounded"
            />
          </div>
        </>
      )}
    </div>
  );
};

export default OnionSkinControls;
