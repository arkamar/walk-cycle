import { el, toast, formatDateTime } from '../ui.js';
import { exportAll, importAll, clearAll } from '../db.js';

export async function renderSettings(target) {
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
      backupCard,
      dangerCard,
      aboutCard,
    ])
  );

  // ---------- Handlers ----------

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
