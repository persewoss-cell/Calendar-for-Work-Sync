import { useCallback, useEffect, useMemo, useState } from 'react';
import { useData } from './lib/useData.js';
import { useReminders } from './lib/useReminders.js';
import { api } from './lib/api.js';
import { anchorFor, buildGrid, stepAnchor } from './lib/grid.js';
import { addDays, diffDays, todayIn } from './lib/date.js';
import { expandEvents, sortDay } from './lib/recurrence.js';

/** CSS variables for each calendar text element: --t-title-size, --t-title-color, --t-title-weight … */
function calTextVars(calText) {
  const vars = {};
  for (const [k, v] of Object.entries(calText)) {
    vars[`--t-${k}-size`] = `${v.size}px`;
    vars[`--t-${k}-color`] = v.color;
    vars[`--t-${k}-weight`] = v.bold ? 700 : 400;
    vars[`--t-${k}-font`] = v.font ? fontCss(v.font) : 'var(--font)';
  }
  return vars;
}

const escapeHtml = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
import { DayEditor } from './components/DayEditor.jsx';
import { MobileShell } from './components/Mobile.jsx';
import { ensureFonts, fontsInHtml } from './lib/fonts.js';
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
  const { me, settings: s, updateSettings, events, setEvents } = data;

  useEffect(() => { setTz(s.timezone); }, [s.timezone]);
  useEffect(() => { setAnchor(null); }, [s.viewStyle]);

  const compact = useIsCompact();
  const phone = compact && !isDesktop;
  // On the phone the calendar is always a full month (like the original phone app).
  const sv = useMemo(() => (phone ? { ...s, viewStyle: 'month', maxRows: 0 } : s), [s, phone]);
  useEffect(() => { setAnchor(null); }, [phone]);
  useEffect(() => { document.body.classList.toggle('phone-body', phone); }, [phone]);
  const realGrid = useMemo(() => buildGrid(sv, anchorRaw ?? anchorFor(sv, today)), [sv, anchorRaw, today]);
  useEffect(() => {
    if (realGrid.from !== range.from || realGrid.to !== range.to) setRange({ from: realGrid.from, to: realGrid.to });
  }, [realGrid.from, realGrid.to, range.from, range.to]);

  const [editor, setEditor] = useState(null); // { date, rect } of the open day editor
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem('collapsed') === '1'; } catch { return false; } });
  const [dialog, setDialog] = useState(null); // { type, ...props }
  const [highlight, setHighlight] = useState(null);
  const [toast, setToast] = useState('');
  const [toasts, dismissToast] = useReminders(Boolean(me), s, events.length);

  const byDay = useMemo(() => expandEvents(events, realGrid.from, realGrid.to), [events, realGrid.from, realGrid.to]);

  // Web fonts: load the ones chosen in settings and the ones used inside item text.
  useEffect(() => {
    ensureFonts([s.fontFamily, s.editFontFamily, s.noteFontFamily, ...Object.values(s.calText).map((t) => t.font), ...events.flatMap((e) => fontsInHtml(e.html))]);
  }, [s.fontFamily, s.editFontFamily, s.noteFontFamily, s.calText, events]);

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }, []);

  // ---------- event mutations (optimistic, server confirms via socket) ----------
  const patchLocal = (id, patch) => setEvents((list) => list.map((e) => (e._id === id ? { ...e, ...patch } : e)));
  const run = (p) => p.catch((e) => { flash(`저장 실패: ${e.message}`); data.loadEvents(); });

  const createEvent = (ev) => run(api.createEvent(ev).then((created) => { setEvents((l) => [...l, created]); return created; }));
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

  // Save what was typed in the day editor. Returns one entry per line ({ item }) for the detail button.
  const saveEditor = async (date, lines) => {
    const originals = sortDay(byDay.get(date) || [], s.doneToBottom).filter((i) => !i.part || i.part[0] === 1);
    const byKey = new Map(originals.map((i) => [i.key, i]));
    const kept = new Set();
    const entries = [];
    const ops = [];
    let changed = false;
    lines.forEach((line, idx) => {
      const orig = line.key && byKey.get(line.key);
      if (!orig) {
        changed = true;
        entries[idx] = createEvent({ date, title: line.text, html: line.html, done: line.done }).then((created) => created && { item: { ...created, occ: created.date } });
        return;
      }
      kept.add(orig.key);
      entries[idx] = Promise.resolve({ item: orig });
      const patch = {};
      if (line.text !== orig.title || line.html !== (orig.html || escapeHtml(orig.title))) {
        patch.title = line.text;
        patch.html = line.html;
      }
      if (line.done !== Boolean(orig.done)) {
        if (orig.rrule) {
          const set = new Set(orig.doneDates || []);
          if (line.done) set.add(orig.occ); else set.delete(orig.occ);
          patch.doneDates = [...set];
        } else {
          patch.done = line.done;
        }
      }
      if (Object.keys(patch).length) { changed = true; ops.push(updateEvent(orig._id, patch)); }
    });
    for (const it of originals) {
      if (!kept.has(it.key)) { changed = true; ops.push(deleteOccurrence(it, 'occurrence')); }
    }
    const resolved = await Promise.all(entries);
    await Promise.all(ops);
    // Keep the typed line order (repeating items keep their own order).
    const ids = resolved.map((e) => e?.item).filter((it) => it && !it.rrule).map((it) => it._id);
    const before = originals.filter((it) => !it.rrule).map((it) => it._id);
    if (ids.length && ids.join() !== before.join()) {
      setEvents((l) => l.map((e) => (ids.includes(e._id) ? { ...e, order: ids.indexOf(e._id) } : e)));
      await run(api.reorder(ids));
    }
    if (changed) playSound(s.editSound);
    return resolved;
  };

  const setDayStyle = useCallback((date, patch) => {
    data.setDays((d) => ({ ...d, [date]: { bg: '', list: '', ...d[date], ...patch } }));
    run(api.setDayStyle(date, patch));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dropItem = useCallback((id, from, to) => {
    const ev = events.find((e) => e._id === id);
    if (!ev || ev.rrule) return;
    const delta = diffDays(from, to);
    updateEvent(id, { date: addDays(ev.date, delta), endDate: addDays(ev.endDate || ev.date, delta) });
    playSound(s.editSound);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, s.editSound]);

  const openEditor = useCallback((date, rect) => setEditor({ date, rect }), []);

  const handlers = useMemo(() => ({
    onOpenEditor: openEditor,
    onToggle: toggleDone,
    onDropItem: dropItem,
  }), [openEditor, toggleDone, dropItem]);

  // ---------- 접기 / 펼치기 ----------
  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try { localStorage.setItem('collapsed', c ? '0' : '1'); } catch { /* ignore */ }
      return !c;
    });
  }, []);
  useEffect(() => { if (me && isDesktop) desktop.setCollapsed?.(collapsed); }, [me, collapsed]);

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
        if (e.key === 'ArrowLeft') setAnchor(stepAnchor(sv, anchorRaw ?? anchorFor(sv, today), -1));
        if (e.key === 'ArrowRight') setAnchor(stepAnchor(sv, anchorRaw ?? anchorFor(sv, today), 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s, shortcutAction, anchorRaw, today, dialog]);

  // ---------- desktop shell ----------
  useEffect(() => { if (me && isDesktop) desktop.applySettings(s); }, [me, s]);
  useEffect(() => (isDesktop ? desktop.onShortcut(shortcutAction) : undefined), [shortcutAction]);
  useEffect(() => (desktop?.onSettingsPreview ? desktop.onSettingsPreview(data.previewSettings) : undefined), [data.previewSettings]);
  useEffect(() => {
    if (!me || !isDesktop) return;
    desktop.syncCards({
      show: s.showNotes,
      notes: data.notes.filter((n) => n.visible).map((n) => n._id),
      countdowns: data.countdowns.filter((c) => c.visible).map((c) => c._id),
    });
  }, [me, s.showNotes, data.notes, data.countdowns]);

  const goTo = (date) => {
    setAnchor(anchorFor(sv, date));
    setHighlight(date);
    setTimeout(() => setHighlight(null), 2500);
    setDialog(null);
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    data.setMe(null);
    setDialog(null);
  };

  if (me === undefined) return <div className="boot">불러오는 중…</div>;
  if (me === null) return <LoginScreen onLoggedIn={data.loadMe} />;
  if (collapsed) {
    return (
      <button type="button" className={`collapsed-chip ${isDesktop ? 'is-desktop' : ''}`} onClick={toggleCollapsed} title="누르면 펼쳐집니다" aria-label="캘린더 펼치기">
        <svg viewBox="0 0 64 64" aria-hidden="true">
          <rect width="64" height="64" fill="#1e88e5" />
          <rect x="16.4" y="16.4" width="8.4" height="8.4" rx="1.8" fill="#ffca28" /><rect x="27.8" y="16.4" width="8.4" height="8.4" rx="1.8" fill="#ef5350" /><rect x="39.2" y="16.4" width="8.4" height="8.4" rx="1.8" fill="#66bb6a" /><rect x="16.4" y="27.8" width="8.4" height="8.4" rx="1.8" fill="#fff" /><rect x="27.8" y="27.8" width="8.4" height="8.4" rx="1.8" fill="#fff" /><rect x="39.2" y="27.8" width="8.4" height="8.4" rx="1.8" fill="#fff" /><rect x="16.4" y="39.2" width="8.4" height="8.4" rx="1.8" fill="#fff" /><rect x="27.8" y="39.2" width="8.4" height="8.4" rx="1.8" fill="#fff" /><rect x="39.2" y="39.2" width="8.4" height="8.4" rx="1.8" fill="#fff" />
        </svg>
      </button>
    );
  }

  const alpha = (100 - s.opacity) / 100;
  const style = {
    '--font': fontCss(s.fontFamily),
    ...calTextVars(s.calText),
    '--edit-font': fontCss(s.editFontFamily),
    '--edit-size': `${s.editFontSize}px`,
    '--edit-color': s.editTextColor,
    '--cell-bg': hexToRgba(s.bgColor, alpha),
    '--sat-bg': hexToRgba(s.saturdayBgColor, Math.min(1, alpha + 0.25)),
    '--sun-bg': hexToRgba(s.sundayBgColor, Math.min(1, alpha + 0.25)),
    '--today-border': s.todayBorder,
    '--cell-pad': `${2 + s.cellPadding * 2}px`,
    '--line-gap': `${s.lineSpacing}px`,
    '--title-btn': s.titleButtonColor,
  };
  const classes = ['app', s.glass && 'glass', s.shadow && 'shadow', isDesktop && 'is-desktop', compact && 'compact', `view-${s.viewStyle}`].filter(Boolean).join(' ');

  const actions = {
    goToday: () => { setAnchor(null); setHighlight(today); setTimeout(() => setHighlight(null), 1500); },
    step: (dir) => setAnchor(stepAnchor(sv, anchorRaw ?? anchorFor(sv, today), dir)),
    newNote: noteActions.create,
    newCountdown: countdownActions.create,
    toggleNotes: () => updateSettings({ showNotes: !s.showNotes }),
    collapse: toggleCollapsed,
    openMobile: () => setDialog({ type: 'mobile' }),
    openAccount: () => setDialog({ type: 'account' }),
    openSearch: () => setDialog({ type: 'search' }),
    openDate: () => setDialog({ type: 'date' }),
    moveResize: () => desktop?.toggleMoveResize(),
    hideCalendar: () => desktop?.hide(),
    toggleTasks: () => updateSettings({ hideTasks: !s.hideTasks }),
    openExport: () => setDialog({ type: 'export' }),
    openImport: () => setDialog({ type: 'import' }),
    openSettings: () => (desktop?.openSettings ? desktop.openSettings('calendar') : setDialog({ type: 'settings' })),
    openHelp: () => setDialog({ type: 'help' }),
    openAbout: () => (desktop?.openSettings ? desktop.openSettings('about') : setDialog({ type: 'settings', tab: 'about' })),
    openCards: () => setDialog({ type: 'cards' }),
    quit: () => desktop?.quit(),
    logout,
  };

  const main = phone ? (
    <MobileShell
      me={me} s={s} today={today} anchor={anchorRaw ?? anchorFor(sv, today)} grid={realGrid} byDay={byDay} days={data.days}
      version={events} notes={data.notes} countdowns={data.countdowns} noteActions={noteActions} countdownActions={countdownActions}
      online={data.online} actions={actions}
      onStep={actions.step} onToday={() => setAnchor(null)}
      onOpenDay={(date) => setEditor({ date, rect: null })}
      onNewEvent={(extra) => setDialog({ type: 'event', item: { date: today, ...extra } })}
      onOpenEvent={(item) => setDialog({ type: 'event', item })}
    />
  ) : null;

  return (
    <div className={phone ? 'app phone' : classes} style={style}>
      {main}
      {!phone && <>
      <Toolbar s={s} today={today} anchor={anchorRaw ?? anchorFor(sv, today)} actions={actions} />
      <CalendarView
        grid={realGrid} s={s} today={today} anchor={anchorRaw ?? anchorFor(sv, today)} byDay={byDay}
        days={data.days} editingDate={editor?.date} highlightDate={highlight} compact={compact} handlers={handlers}
      />
      {!data.online && <div className="offline">서버에 연결할 수 없습니다. 다시 연결 중…</div>}
      {s.showNotes && !isDesktop && !compact && (
        <CardsLayer notes={data.notes} countdowns={data.countdowns} s={s} noteActions={noteActions} countdownActions={countdownActions} />
      )}
      </>}

      {editor && (
        <DayEditor
          key={editor.date}
          date={editor.date}
          items={sortDay(byDay.get(editor.date) || [], s.doneToBottom).filter((i) => !i.part || i.part[0] === 1)}
          s={s}
          anchorRect={editor.rect}
          dayBg={data.days[editor.date]?.bg || ''}
          listStyle={data.days[editor.date]?.list || s.listStyle}
          compact={compact}
          onSave={(lines) => saveEditor(editor.date, lines)}
          onClose={() => setEditor(null)}
          onSetBg={(bg) => setDayStyle(editor.date, { bg })}
          onCycleList={() => {
            const cur = data.days[editor.date]?.list || s.listStyle;
            const next = { bullet: 'number', number: 'none', none: 'bullet' }[cur] || 'bullet';
            setDayStyle(editor.date, { list: next === s.listStyle ? '' : next }); // back to the setting → no override
          }}
          onOpenDetail={(entry) => {
            const date = editor.date;
            setEditor(null);
            setDialog({ type: 'event', item: entry?.item || { date } });
          }}
        />
      )}
      {dialog?.type === 'event' && (
        <EventDialog
          item={dialog.item}
          onClose={() => setDialog(null)}
          onSave={(patch) => {
            // A plain-text title edit replaces the formatted text.
            if (patch.title !== dialog.item.title) patch.html = '';
            if (dialog.item._id) updateEvent(dialog.item._id, patch); else createEvent(patch);
            playSound(s.editSound);
            setDialog(null);
          }}
          onDelete={(scope) => { deleteOccurrence(dialog.item, scope); setDialog(null); }}
        />
      )}
      {dialog?.type === 'settings' && (
        <SettingsDialog s={s} update={updateSettings} initialTab={dialog.tab} onClose={() => setDialog(null)} onOpenHelp={() => setDialog({ type: 'help' })} />
      )}
      {dialog?.type === 'account' && (
        <AccountDialog me={me} onSaved={data.loadMe} onLogout={logout} onClose={() => setDialog(null)} />
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
