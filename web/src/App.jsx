import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from './lib/useData.js';
import { useReminders } from './lib/useReminders.js';
import { api } from './lib/api.js';
import { anchorFor, buildGrid, stepAnchor } from './lib/grid.js';
import { addDays, diffDays, todayIn } from './lib/date.js';
import { expandEvents, sortDay } from './lib/recurrence.js';
import { fontCss, hexToRgba, mergeSettings } from './lib/settings.js';
import { playSound } from './lib/sound.js';
import { desktop, isDesktop } from './lib/desktop.js';
import { CalendarView } from './components/CalendarView.jsx';
import { Toolbar } from './components/Toolbar.jsx';
import { EventDialog } from './components/EventDialog.jsx';
import { SettingsDialog } from './components/SettingsDialog.jsx';
import { AccountDialog } from './components/AccountDialog.jsx';
import { DateDialog, ExportDialog, HelpDialog, MobileDialog, SearchDialog } from './components/SmallDialogs.jsx';
import { CardsLayer, CardsList, CountdownCard, StickyNote } from './components/Cards.jsx';
import { DaySheet } from './components/DaySheet.jsx';
import { LoginScreen } from './components/LoginScreen.jsx';
import { Icon } from './components/Icon.jsx';
import { Modal } from './components/Modal.jsx';

function useIsCompact() {
  const q = '(max-width: 720px)';
  const [compact, setCompact] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = () => setCompact(m.matches);
    m.addEventListener('change', h);
    return () => m.removeEventListener('change', h);
  }, []);
  return compact;
}

function useToday(tz) {
  const [today, setToday] = useState(() => todayIn(tz));
  useEffect(() => {
    setToday(todayIn(tz));
    const t = setInterval(() => setToday(todayIn(tz)), 60 * 1000);
    return () => clearInterval(t);
  }, [tz]);
  return today;
}

export default function App() {
  const [tz, setTz] = useState('Asia/Seoul');
  const today = useToday(tz);
  const [anchorRaw, setAnchor] = useState(null);
  const [range, setRange] = useState(() => {
    const d = mergeSettings();
    const g = buildGrid(d, anchorFor(d, todayIn(d.timezone)));
    return { from: g.from, to: g.to };
  });
  const data = useData(range);
  const { me, settings: s, updateSettings, events, setEvents, google } = data;

  useEffect(() => { setTz(s.timezone); }, [s.timezone]);
  useEffect(() => { setAnchor(null); }, [s.viewStyle]);

  const realGrid = useMemo(() => buildGrid(s, anchorRaw ?? anchorFor(s, today)), [s, anchorRaw, today]);
  useEffect(() => {
    if (realGrid.from !== range.from || realGrid.to !== range.to) setRange({ from: realGrid.from, to: realGrid.to });
  }, [realGrid.from, realGrid.to, range.from, range.to]);

  const compact = useIsCompact();
  const [editingDate, setEditingDate] = useState(null);
  const [dialog, setDialog] = useState(null); // { type, ...props }
  const [highlight, setHighlight] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState('');
  const [toasts, dismissToast] = useReminders(Boolean(me), s, events.length);

  const byDay = useMemo(() => expandEvents(events, realGrid.from, realGrid.to), [events, realGrid.from, realGrid.to]);

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  // ---------- event mutations (optimistic, server confirms via socket) ----------
  const patchLocal = (id, patch) => setEvents((list) => list.map((e) => (e._id === id ? { ...e, ...patch } : e)));
  const run = (p) => p.catch((e) => { flash(`저장 실패: ${e.message}`); data.loadEvents(); });

  const createEvent = (ev) => run(api.createEvent(ev).then((created) => setEvents((l) => [...l, created])));
  const updateEvent = (id, patch) => { patchLocal(id, patch); return run(api.updateEvent(id, patch)); };
  const deleteOccurrence = (item, scope) => {
    if (item.rrule && scope === 'occurrence') return updateEvent(item._id, { exdates: [...(item.exdates || []), item.occ] });
    setEvents((l) => l.filter((e) => e._id !== item._id));
    return run(api.deleteEvent(item._id));
  };

  const toggleDone = useCallback((item) => {
    if (item.rrule) {
      const set = new Set(item.doneDates || []);
      if (set.has(item.occ)) set.delete(item.occ); else set.add(item.occ);
      updateEvent(item._id, { doneDates: [...set] });
    } else {
      updateEvent(item._id, { done: !item.done });
    }
    playSound(s.editSound);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.editSound]);

  const commitCell = useCallback(async (date, items, rows) => {
    setEditingDate(null);
    const originals = items.filter((i) => !i.part || i.part[0] === 1);
    const kept = new Set();
    let changed = false;
    const ops = [];
    for (const row of rows) {
      const text = row.text.trim();
      if (row.item) {
        kept.add(row.item.key);
        if (!text) { ops.push(deleteOccurrence(row.item, 'occurrence')); changed = true; } else if (text !== row.item.title) { ops.push(updateEvent(row.item._id, { title: text })); changed = true; }
      }
    }
    for (const it of originals) {
      if (!kept.has(it.key)) { ops.push(deleteOccurrence(it, 'occurrence')); changed = true; }
    }
    const maxOrder = Math.max(-1, ...originals.map((i) => i.order ?? 0));
    let n = 0;
    for (const row of rows) {
      if (!row.item && row.text.trim()) {
        ops.push(createEvent({ date, title: row.text.trim(), order: maxOrder + 1 + n++ }));
        changed = true;
      }
    }
    if (changed) playSound(s.editSound);
    await Promise.all(ops);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.editSound]);

  const dropItem = useCallback((id, from, to) => {
    const ev = events.find((e) => e._id === id);
    if (!ev || ev.rrule) return;
    const delta = diffDays(from, to);
    updateEvent(id, { date: addDays(ev.date, delta), endDate: addDays(ev.endDate || ev.date, delta) });
    playSound(s.editSound);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, s.editSound]);

  const openItem = useCallback((item) => setDialog({ type: 'event', item }), []);
  const startEdit = useCallback((date) => {
    if (compact) setDialog({ type: 'day', date });
    else setEditingDate(date);
  }, [compact]);

  const handlers = useMemo(() => ({
    onStartEdit: startEdit,
    onCommit: commitCell,
    onCancelEdit: () => setEditingDate(null),
    onToggle: toggleDone,
    onOpen: openItem,
    onDropItem: dropItem,
  }), [startEdit, commitCell, toggleDone, openItem, dropItem]);

  // ---------- notes & countdowns ----------
  const noteActions = {
    create: () => api.createNote({ title: '', items: [], visible: true }).then((n) => { data.setNotes((l) => [...l, n]); updateSettings({ showNotes: true }); }),
    update: (id, patch) => { data.setNotes((l) => l.map((n) => (n._id === id ? { ...n, ...patch } : n))); api.updateNote(id, patch); },
    remove: (id) => { data.setNotes((l) => l.filter((n) => n._id !== id)); api.deleteNote(id); },
  };
  const countdownActions = {
    create: () => api.createCountdown({ title: '', date: addDays(today, 30), visible: true }).then((c) => { data.setCountdowns((l) => [...l, c]); updateSettings({ showNotes: true }); }),
    update: (id, patch) => { data.setCountdowns((l) => l.map((c) => (c._id === id ? { ...c, ...patch } : c))); api.updateCountdown(id, patch); },
    remove: (id) => { data.setCountdowns((l) => l.filter((c) => c._id !== id)); api.deleteCountdown(id); },
  };

  // ---------- once-a-day 자동 연기 ----------
  useEffect(() => {
    if (!me || !s.autoPostpone) return;
    let last = '';
    try { last = localStorage.getItem('lastRollover') || ''; } catch { /* ignore */ }
    if (last === today) return;
    api.rollover(today).then((r) => {
      try { localStorage.setItem('lastRollover', today); } catch { /* ignore */ }
      if (r.moved) flash(`끝내지 못한 일 ${r.moved}개를 오늘로 옮겼습니다.`);
    }).catch(() => {});
  }, [me, s.autoPostpone, today, flash]);

  // ---------- keyboard shortcuts (in-app) ----------
  const shortcutAction = useCallback((name) => {
    if (name === 'toggleTasks') updateSettings({ hideTasks: !s.hideTasks });
    if (name === 'toggleNotes') updateSettings({ showNotes: !s.showNotes });
    if (name === 'hideCalendar') desktop?.hide();
  }, [s.hideTasks, s.showNotes, updateSettings]);

  useEffect(() => {
    const match = (e, keys) => {
      const parts = keys.split('+');
      const key = parts.pop().toLowerCase();
      return e.key.toLowerCase() === key && parts.includes('Ctrl') === e.ctrlKey && parts.includes('Alt') === e.altKey && parts.includes('Shift') === e.shiftKey;
    };
    const onKey = (e) => {
      for (const [name, sc] of Object.entries(s.shortcuts)) {
        if (sc.enabled && name !== 'finishEdit' && match(e, sc.keys)) { e.preventDefault(); shortcutAction(name); }
      }
      if (!e.target.closest?.('input, textarea, select') && !dialog) {
        if (e.key === 'ArrowLeft') setAnchor(stepAnchor(s, anchorRaw ?? anchorFor(s, today), -1));
        if (e.key === 'ArrowRight') setAnchor(stepAnchor(s, anchorRaw ?? anchorFor(s, today), 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s, shortcutAction, anchorRaw, today, dialog]);

  // ---------- desktop shell ----------
  useEffect(() => { if (me && isDesktop) desktop.applySettings(s); }, [me, s]);
  useEffect(() => (isDesktop ? desktop.onShortcut(shortcutAction) : undefined), [shortcutAction]);
  useEffect(() => {
    if (!me || !isDesktop) return;
    desktop.syncCards({
      show: s.showNotes,
      notes: data.notes.filter((n) => n.visible).map((n) => n._id),
      countdowns: data.countdowns.filter((c) => c.visible).map((c) => c._id),
    });
  }, [me, s.showNotes, data.notes, data.countdowns]);

  const goTo = (date) => {
    setAnchor(anchorFor(s, date));
    setHighlight(date);
    setTimeout(() => setHighlight(null), 2500);
    setDialog(null);
  };

  const cloud = async () => {
    if (!google.enabled) return setDialog({ type: 'account' });
    setSyncing(true);
    try {
      const r = await api.googleSync();
      flash(r.error ? `동기화 실패: ${r.error}` : '구글 캘린더와 동기화했습니다.');
      data.refreshGoogle();
    } catch (e) {
      flash(e.message);
    } finally {
      setSyncing(false);
    }
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    data.setMe(null);
    setDialog(null);
  };

  if (me === undefined) return <div className="boot">불러오는 중…</div>;
  if (me === null) return <LoginScreen />;

  const visibleEvents = [...byDay.values()].flat();
  const alpha = (100 - s.opacity) / 100;
  const style = {
    '--font': fontCss(s.fontFamily),
    '--font-size': `${s.fontSize}px`,
    '--text': s.textColor,
    '--edit-font': fontCss(s.editFontFamily),
    '--edit-size': `${s.editFontSize}px`,
    '--edit-color': s.editTextColor,
    '--cell-bg': hexToRgba(s.bgColor, alpha),
    '--rest-bg-alpha': hexToRgba(s.holidayBgColor, Math.min(1, alpha + 0.3)),
    '--today-border': s.todayBorder,
    '--cell-pad': `${2 + s.cellPadding * 2}px`,
    '--line-gap': `${s.lineSpacing}px`,
    '--title-btn': s.titleButtonColor,
  };
  const classes = ['app', s.glass && 'glass', s.shadow && 'shadow', isDesktop && 'is-desktop', compact && 'compact', `view-${s.viewStyle}`].filter(Boolean).join(' ');

  const actions = {
    goToday: () => { setAnchor(null); setHighlight(today); setTimeout(() => setHighlight(null), 1500); },
    step: (dir) => setAnchor(stepAnchor(s, anchorRaw ?? anchorFor(s, today), dir)),
    newNote: noteActions.create,
    newCountdown: countdownActions.create,
    toggleNotes: () => updateSettings({ showNotes: !s.showNotes }),
    openMobile: () => setDialog({ type: 'mobile' }),
    cloud,
    openAccount: () => setDialog({ type: 'account' }),
    openSearch: () => setDialog({ type: 'search' }),
    openDate: () => setDialog({ type: 'date' }),
    moveResize: () => desktop?.toggleMoveResize(),
    hideCalendar: () => desktop?.hide(),
    toggleTasks: () => updateSettings({ hideTasks: !s.hideTasks }),
    openExport: () => setDialog({ type: 'export' }),
    openImport: () => setDialog({ type: 'import' }),
    openSettings: () => setDialog({ type: 'settings' }),
    openHelp: () => setDialog({ type: 'help' }),
    openAbout: () => setDialog({ type: 'settings', tab: 'about' }),
    openCards: () => setDialog({ type: 'cards' }),
    quit: () => desktop?.quit(),
    logout,
  };

  return (
    <div className={classes} style={style}>
      <Toolbar s={s} today={today} anchor={anchorRaw ?? anchorFor(s, today)} google={google} syncing={syncing} actions={actions} />
      <CalendarView
        grid={realGrid} s={s} today={today} anchor={anchorRaw ?? anchorFor(s, today)} byDay={byDay}
        editingDate={editingDate} highlightDate={highlight} compact={compact} handlers={handlers}
      />
      {!data.online && <div className="offline">서버에 연결할 수 없습니다. 다시 연결 중…</div>}
      {s.showNotes && !isDesktop && !compact && (
        <CardsLayer notes={data.notes} countdowns={data.countdowns} s={s} noteActions={noteActions} countdownActions={countdownActions} />
      )}
      {compact && (data.notes.length > 0 || data.countdowns.length > 0) && (
        <button className="fab" onClick={actions.openCards} aria-label="메모와 D-day"><Icon name="note" /></button>
      )}

      {dialog?.type === 'event' && (
        <EventDialog
          item={dialog.item}
          google={google}
          onClose={() => setDialog(null)}
          onSave={(patch) => {
            if (dialog.item._id) updateEvent(dialog.item._id, patch); else createEvent(patch);
            playSound(s.editSound);
            setDialog(null);
          }}
          onDelete={(scope) => { deleteOccurrence(dialog.item, scope); setDialog(null); }}
        />
      )}
      {dialog?.type === 'day' && (
        <DaySheet
          date={dialog.date} s={s}
          items={sortDay(byDay.get(dialog.date) || [], s.doneToBottom)}
          onClose={() => setDialog(null)}
          onAdd={(title) => createEvent({ date: dialog.date, title })}
          onToggle={toggleDone}
          onOpen={openItem}
          onNew={() => setDialog({ type: 'event', item: { date: dialog.date } })}
        />
      )}
      {dialog?.type === 'settings' && (
        <SettingsDialog s={s} update={updateSettings} initialTab={dialog.tab} onClose={() => setDialog(null)} onOpenHelp={() => setDialog({ type: 'help' })} />
      )}
      {dialog?.type === 'account' && (
        <AccountDialog me={me} google={google} refreshGoogle={data.refreshGoogle} onLogout={logout} onClose={() => setDialog(null)} visibleEvents={visibleEvents} />
      )}
      {dialog?.type === 'search' && <SearchDialog onPick={goTo} onClose={() => setDialog(null)} />}
      {dialog?.type === 'date' && <DateDialog value={today} onPick={goTo} onClose={() => setDialog(null)} />}
      {(dialog?.type === 'export' || dialog?.type === 'import') && (
        <ExportDialog mode={dialog.type} s={s} onClose={() => setDialog(null)} onImported={() => { data.loadEvents(); data.loadNotes(); data.loadCountdowns(); }} />
      )}
      {dialog?.type === 'mobile' && <MobileDialog onClose={() => setDialog(null)} />}
      {dialog?.type === 'help' && <HelpDialog onClose={() => setDialog(null)} />}
      {dialog?.type === 'cards' && (
        <Modal title="메모 · D-day" onClose={() => setDialog(null)} width={420}>
          <CardsList notes={data.notes} countdowns={data.countdowns} s={s} noteActions={noteActions} countdownActions={countdownActions} />
          <CardsLayerInline notes={data.notes} countdowns={data.countdowns} s={s} noteActions={noteActions} countdownActions={countdownActions} />
        </Modal>
      )}

      <div className="toasts">
        {toast && <div className="toast">{toast}</div>}
        {toasts.map((t) => (
          <div key={t.key} className="toast reminder" onClick={() => dismissToast(t.key)}>
            <Icon name="bell" size={16} /> {t.body}
          </div>
        ))}
      </div>
    </div>
  );
}

function CardsLayerInline({ notes, countdowns, s, noteActions, countdownActions }) {
  return (
    <div className="cards-inline">
      {countdowns.filter((c) => c.visible).map((c) => (
        <CountdownCard key={c._id} card={c} s={s} onChange={(p) => countdownActions.update(c._id, p)} onDelete={() => countdownActions.remove(c._id)} onHide={() => countdownActions.update(c._id, { visible: false })} />
      ))}
      {notes.filter((n) => n.visible).map((n) => (
        <StickyNote key={n._id} note={n} s={s} onChange={(p) => noteActions.update(n._id, p)} onDelete={() => noteActions.remove(n._id)} onHide={() => noteActions.update(n._id, { visible: false })} />
      ))}
      <div className="inline">
        <button className="btn" onClick={noteActions.create}><Icon name="plus" size={14} /> 메모</button>
        <button className="btn" onClick={countdownActions.create}><Icon name="plus" size={14} /> D-day</button>
      </div>
    </div>
  );
}
