import React from 'react';

export type CoreModuleId =
  | 'core_math'
  | 'state_engine'
  | 'fk_engine'
  | 'ik_engine'
  | 'constraint_bridge'
  | 'interaction_engine'
  | 'animation_engine'
  | 'onion_skin'
  | 'overlay_engine'
  | 'transfer_engine';

export type CoreModuleDefinition = {
  id: CoreModuleId;
  title: string;
  group: 'core' | 'motion' | 'interaction' | 'animation' | 'io';
  description: string;
  dependsOn: CoreModuleId[];
  frictionNote: string;
};

export type CoreModuleState = Record<CoreModuleId, boolean>;

export type ModuleFriction = {
  level: 'info' | 'warning';
  message: string;
};

type CoreModuleGridProps = {
  definitions: CoreModuleDefinition[];
  state: CoreModuleState;
  onToggle: (moduleId: CoreModuleId) => void;
  friction: ModuleFriction[];
  moduleStatusLine?: string;
};

const GROUP_LABEL: Record<CoreModuleDefinition['group'], string> = {
  core: 'Core',
  motion: 'Motion',
  interaction: 'Interaction',
  animation: 'Animation',
  io: 'Transfer/IO',
};

const GROUP_ORDER: CoreModuleDefinition['group'][] = [
  'core',
  'motion',
  'interaction',
  'animation',
  'io',
];

const levelClass = (level: ModuleFriction['level']): string =>
  level === 'warning'
    ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
    : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200';

export const CoreModuleGrid: React.FC<CoreModuleGridProps> = ({
  definitions,
  state,
  onToggle,
  friction,
  moduleStatusLine,
}) => {
  return (
    <div className="w-full max-w-5xl bg-zinc-900/85 border-b border-zinc-800 px-3 py-3 text-[10px]">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-zinc-300 uppercase tracking-[0.2em] font-bold">Core Module Grid</div>
        {moduleStatusLine ? <div className="text-zinc-400">{moduleStatusLine}</div> : null}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {GROUP_ORDER.map((group) => {
          const modules = definitions.filter((definition) => definition.group === group);
          if (!modules.length) {
            return null;
          }

          return (
            <section key={group} className="border border-zinc-800 rounded bg-zinc-950/65 p-2">
              <div className="text-zinc-400 uppercase tracking-widest mb-2">{GROUP_LABEL[group]}</div>
              <div className="grid gap-2">
                {modules.map((module) => {
                  const active = state[module.id];
                  return (
                    <article
                      key={module.id}
                      className={`border rounded p-2 transition-colors ${
                        active
                          ? 'border-emerald-500/45 bg-emerald-500/5'
                          : 'border-zinc-800 bg-zinc-900/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-zinc-100 font-semibold tracking-wide">{module.title}</div>
                          <div className="text-zinc-400 mt-0.5">{module.description}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onToggle(module.id)}
                          className={`px-2 py-1 rounded border text-[9px] uppercase tracking-wide ${
                            active
                              ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
                              : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                          }`}
                        >
                          {active ? 'On' : 'Off'}
                        </button>
                      </div>
                      <div className="mt-1 text-zinc-500">
                        Depends: {module.dependsOn.length ? module.dependsOn.join(', ') : 'none'}
                      </div>
                      <div className="mt-1 text-zinc-500">Guardrail: {module.frictionNote}</div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {friction.length ? (
        <div className="mt-2 grid gap-1">
          {friction.map((item, idx) => (
            <div key={`${item.level}-${idx}`} className={`border rounded px-2 py-1 ${levelClass(item.level)}`}>
              {item.message}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 border border-emerald-500/35 bg-emerald-500/10 text-emerald-200 rounded px-2 py-1">
          Module graph healthy. Animation path is deterministic and clean.
        </div>
      )}
    </div>
  );
};

export default CoreModuleGrid;
