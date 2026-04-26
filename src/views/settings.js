import { el, toast, formatDateTime } from '../ui.js';
import { exportAll, importAll, clearAll, getActiveSession, endSession } from '../db.js';

const CFG_KEY = 'walk-cycle-config';

function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY) || '{}');
  } catch {
    return {};
  }
}

function setConfig(cfg) {
  localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
}

export function getCompetitionGoal() {
  const cfg = getConfig();
  return cfg.competitionGoal || null;
}

export function setCompetitionGoal(goal) {
  const cfg = getConfig();
  cfg.competitionGoal = goal;
  setConfig(cfg);
}

export async function renderSettings(target) {
  target.innerHTML = '';  // Force clear
  target.textContent = 'Loading...';
  await new Promise(r => setTimeout(r, 100));
  target.innerHTML = '';
  const stopSessionBtn = el(
    'button',
    {
      class: 'btn btn-danger',
      type: 'button',
      style: { display: 'none' },
      onClick: async () => {
        if (!confirm('Stop the current session?')) return;
        const s = await getActiveSession();
        if (s) {
          await endSession(s.id);
          toast('Session stopped');
          checkActive();
          window.location.hash = '/';
        }
      },
    },
    'Stop active session'
  );

  const sessionCard = el('div', { class: 'card' }, [
    el('h3', {}, 'Active session'),
    el(
      'p',
      { class: 'muted' },
      'If you have a session in progress, you can stop it from here.'
    ),
    stopSessionBtn,
  ]);

  // ---------- Competition goal ----------
  const goalTypeSel = el('select', { id: 'goal-type' });
  goalTypeSel.appendChild(el('option', { value: '' }, 'None'));
  goalTypeSel.appendChild(el('option', { value: 'ups' }, 'Target Up count'));
  goalTypeSel.appendChild(el('option', { value: 'endTime' }, 'Target end time'));

  const goalValInput = el('input', {
    type: 'number',
    id: 'goal-value',
    min: '1',
    placeholder: '9',
    style: { width: '80px' },
  });

  const goalTimeInput = el('input', {
    type: 'time',
    id: 'goal-time',
    style: { display: 'none' },
  });

  const goalRow = el('div', { class: 'row', style: { gap: '0.5rem', alignItems: 'center' } }, [
    goalTypeSel,
    goalValInput,
    goalTimeInput,
  ]);

  const initGoal = getCompetitionGoal();
  if (initGoal) {
    goalTypeSel.value = initGoal.type;
    if (initGoal.type === 'ups') {
      goalValInput.value = initGoal.value;
    } else if (initGoal.type === 'endTime') {
      goalTimeInput.style.display = '';
      goalTimeInput.value = initGoal.value;
      goalValInput.style.display = 'none';
    }
  }

  goalTypeSel.onchange = () => {
    const type = goalTypeSel.value;
    goalValInput.style.display = type === 'ups' ? '' : 'none';
    goalTimeInput.style.display = type === 'endTime' ? '' : 'none';
    saveGoal();
  };
  goalValInput.onchange = saveGoal;
  goalTimeInput.onchange = saveGoal;

  function saveGoal() {
    const type = goalTypeSel.value;
    if (!type) {
      setCompetitionGoal(null);
    } else if (type === 'ups') {
      const val = parseInt(goalValInput.value, 10);
      setCompetitionGoal({ type: 'ups', value: val || 9 });
    } else if (type === 'endTime') {
      setCompetitionGoal({ type: 'endTime', value: goalTimeInput.value });
    }
    toast('Goal saved');
  }

  const compCard = el('div', { class: 'card' }, [
    el('h3', {}, 'Competition goal'),
    el('p', { class: 'muted' }, 'Set a target to track your progress.'),
    goalRow,
  ]);

  // ---------- Backup ----------
  const exportBtn = el(
    'button',
    {
      class: 'btn btn-primary',
      type: 'button',
      onClick: doExport,
    },
    'Export JSON backup'
  );

  const importInput = el('input', {
    type: 'file',
    accept: 'application/json,.json',
    style: { display: 'none' },
    onChange: doImport,
  });

  const importBtn = el(
    'button',
    {
      class: 'btn',
      type: 'button',
      onClick: () => importInput.click(),
    },
    'Import JSON…'
  );

  const mergeChk = el('input', { type: 'checkbox', id: 'merge-chk' });
  const mergeLabel = el('label', { for: 'merge-chk', class: 'muted' }, [
    mergeChk,
    ' Merge with existing data (otherwise replaces all)',
  ]);

  const backupCard = el('div', { class: 'card' }, [
    el('h3', {}, 'Backup'),
    el(
      'p',
      { class: 'muted' },
      'All data is stored locally on this device (IndexedDB). Export regularly so you don\'t lose history.'
    ),
    el('div', { class: 'row wrap', style: { gap: '0.5rem' } }, [
      exportBtn,
      importBtn,
      importInput,
    ]),
    el('div', { style: { marginTop: '0.5rem' } }, mergeLabel),
  ]);

  // ---------- Danger zone ----------
  const clearBtn = el(
    'button',
    {
      class: 'btn btn-danger',
      type: 'button',
      onClick: doClear,
    },
    'Delete all data'
  );

  const dangerCard = el('div', { class: 'card' }, [
    el('h3', {}, 'Danger zone'),
    el(
      'p',
      { class: 'muted' },
      'This will permanently delete every session and event from this device.'
    ),
    clearBtn,
  ]);

  // ---------- About ----------
  const aboutCard = el('div', { class: 'card' }, [
    el('h3', {}, 'About'),
    el('p', { class: 'muted' }, [
      'Walk Cycle · v0.1.0 · ',
      el('span', {}, 'Local-first · works offline'),
    ]),
    el(
      'p',
      { class: 'muted' },
      'Press Up to start climbing, Pause when you reach the top, Down to head back, Pause again at the start. Repeat.'
    ),
  ]);

  target.appendChild(
    el('div', {}, [
      el('h2', { style: { marginBottom: '0.75rem' } }, 'Settings'),
      sessionCard,
      compCard,
      backupCard,
      dangerCard,
      aboutCard,
    ])
  );

  // ---------- Handlers ----------
  
  let hasActiveSession = false;
  async function checkActive() {
    const s = await getActiveSession();
    hasActiveSession = !!s;
    stopSessionBtn.style.display = hasActiveSession ? '' : 'none';
  }
  checkActive();

  async function doExport() {
    try {
      const data = await exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const a = el('a', {
        href: url,
        download: `walk-cycle-backup-${ts}.json`,
      });
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(
        `Exported ${data.sessions.length} session${
          data.sessions.length === 1 ? '' : 's'
        } and ${data.events.length} event${data.events.length === 1 ? '' : 's'}`
      );
    } catch (err) {
      console.error(err);
      toast('Export failed');
    }
  }

  async function doImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const merge = mergeChk.checked;
      const summary = `${data.sessions?.length ?? 0} sessions, ${
        data.events?.length ?? 0
      } events from ${
        data.exportedAt ? formatDateTime(data.exportedAt) : 'unknown date'
      }`;
      const verb = merge ? 'Merge' : 'REPLACE all current data with';
      if (!confirm(`${verb} ${summary}?`)) {
        importInput.value = '';
        return;
      }
      await importAll(data, { merge });
      toast('Import successful');
    } catch (err) {
      console.error(err);
      toast(`Import failed: ${err.message}`);
    } finally {
      importInput.value = '';
    }
  }

  async function doClear() {
    const phrase = 'DELETE';
    const answer = prompt(
      `This will erase ALL sessions and events.\nType "${phrase}" to confirm.`
    );
    if (answer !== phrase) {
      toast('Cancelled');
      return;
    }
    await clearAll();
    toast('All data deleted');
  }
}
