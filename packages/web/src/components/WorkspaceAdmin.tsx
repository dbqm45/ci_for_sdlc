import { useEffect, useState } from 'react';
import { api, currentWorkspace, errMsg } from '../api';
import { DEFAULT_WORKSPACE } from '../lib/workspace';

/** Renaming and deleting the workspace shown (F5). Deleting needs its id typed back; its data moves aside on the server. */
export function WorkspaceAdmin({ toast }: { toast: (m: string) => void }) {
  const ws = currentWorkspace();
  const [name, setName] = useState('');
  const [saved, setSaved] = useState('');
  useEffect(() => {
    void api
      .workspaces()
      .then((all) => {
        const n = all.find((w) => w.id === ws)?.name ?? ws;
        setName(n);
        setSaved(n);
      })
      .catch(() => undefined);
  }, [ws]);

  const rename = async () => {
    try {
      const w = await api.renameWorkspace(ws, name.trim());
      setSaved(w.name);
      toast(`Workspace renamed to ${w.name}`);
    } catch (e) {
      toast(errMsg(e));
    }
  };
  const remove = async () => {
    const typed = window.prompt(`Delete workspace "${saved}"? Its analysis stops and its data moves to workspaces-deleted/ on the server.\nType its id (${ws}) to confirm:`);
    if (typed === null) return;
    try {
      await api.deleteWorkspace(ws, typed.trim());
      toast(`Workspace ${saved} deleted`);
      location.hash = `/w/${DEFAULT_WORKSPACE}/overview`;
    } catch (e) {
      toast(errMsg(e));
    }
  };

  return (
    <div className="row wrap" style={{ gap: 8, marginTop: 12, alignItems: 'flex-end' }}>
      <label className="col" style={{ gap: 4 }}>
        <span className="small muted">Workspace name (id: {ws})</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <button className="btn" onClick={() => void rename()} disabled={!name.trim() || name.trim() === saved}>
        Rename workspace
      </button>
      {ws !== DEFAULT_WORKSPACE && (
        <button className="btn danger" onClick={() => void remove()}>
          Delete workspace…
        </button>
      )}
    </div>
  );
}
