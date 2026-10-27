import { useEffect, useState } from 'react';
import { api, errMsg } from '../api';
import { hashPath } from '../lib/workspace';

const NEW = '__new__';

/** Switches the workspace (F5): another workspace is another address, `#/w/<id>/overview`; "New workspace…" creates one. */
export function WorkspaceSelect({ ws, toast }: { ws: string; toast: (m: string) => void }) {
  const [list, setList] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => void api.workspaces().then(setList).catch(() => undefined), [ws]);
  // One workspace and no wish for another: nothing to switch, so the header stays as it was.
  if (list.length < 2 && ws === 'default') {
    return (
      <button className="btn ghost sm" onClick={() => void create()} title="Another product or repository with its own sources, analysis and decisions">
        + Workspace
      </button>
    );
  }

  async function create() {
    const id = window.prompt('New workspace id (lower-case letters, digits and -, e.g. mobile):')?.trim();
    if (!id) return;
    const name = window.prompt('Its name (shown in the header):', id)?.trim() ?? id;
    try {
      const w = await api.createWorkspace(id, name || id);
      location.hash = hashPath('/settings', w.id);
      toast(`Workspace ${w.name} created — set up its sources`);
    } catch (e) {
      toast(errMsg(e));
    }
  }

  return (
    <select
      className="input"
      aria-label="Workspace"
      title="Workspace: its own sources, analysis and decisions; pdi sees a change across all of them"
      value={ws}
      onChange={(e) => {
        if (e.target.value === NEW) return void create();
        location.hash = `/w/${encodeURIComponent(e.target.value)}/overview`;
      }}
      style={{ width: 'auto', minWidth: 140 }}
    >
      {list.map((w) => (
        <option key={w.id} value={w.id}>
          {w.name}
        </option>
      ))}
      <option value={NEW}>New workspace…</option>
    </select>
  );
}
