import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from './lib/api.js';
import { mergeSettings } from './lib/settings.js';
import { CountdownCard, StickyNote } from './components/Cards.jsx';

/** A single sticky note / D-day card in its own transparent desktop window (Electron). */
export default function CardWindow({ kind, id }) {
  const [item, setItem] = useState(null);
  const [s, setS] = useState(mergeSettings());
  useEffect(() => {
    document.body.classList.add('card-window');
    const load = async () => {
      const [me, list] = await Promise.all([api.me(), kind === 'note' ? api.notes() : api.countdowns()]);
      setS(mergeSettings(me.settings));
      setItem(list.find((x) => x._id === id) || null);
    };
    load().catch(() => {});
    const socket = io({ path: '/socket.io', withCredentials: true });
    socket.on('changed', ({ kind: k }) => { if (k === `${kind}s` || k === 'settings') load().catch(() => {}); });
    return () => socket.close();
  }, [kind, id]);
  if (!item) return null;
  const update = (patch) => {
    setItem((cur) => ({ ...cur, ...patch }));
    (kind === 'note' ? api.updateNote : api.updateCountdown)(id, patch);
  };
  const remove = () => (kind === 'note' ? api.deleteNote : api.deleteCountdown)(id);
  const handle = { className: 'drag-region' };
  return kind === 'note' ? (
    <StickyNote note={item} s={s} onChange={update} onDelete={remove} onHide={() => update({ visible: false })} dragHandleProps={handle} />
  ) : (
    <CountdownCard card={item} s={s} onChange={update} onDelete={remove} onHide={() => update({ visible: false })} dragHandleProps={handle} />
  );
}
