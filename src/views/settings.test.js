/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock ui.js module completely before importing settings.js
vi.mock('../ui.js', () => ({
  el: vi.fn((tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    // Handle attributes
    if (attrs && typeof attrs === 'object') {
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === 'class' || k === 'className') {
          node.className = v;
        } else if (k === 'style' && typeof v === 'object') {
          Object.assign(node.style, v);
        } else if (k === 'textContent') {
          node.textContent = v;
        } else if (k === 'html') {
          node.innerHTML = v;
        } else if (k.startsWith('on') && typeof v === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (k === 'for') {
          node.setAttribute('for', v);
        } else if (v === true) {
          node.setAttribute(k, '');
        } else if (v != null && v !== false) {
          node.setAttribute(k, v);
        }
      });
    }
    // Handle children
    const appendChildren = (parent, child) => {
      if (child == null) return;
      if (Array.isArray(child)) {
        child.forEach(c => appendChildren(parent, c));
      } else if (child instanceof Node) {
        parent.appendChild(child);
      } else {
        parent.appendChild(document.createTextNode(String(child)));
      }
    };
    appendChildren(node, children);
    return node;
  }),
  toast: vi.fn(),
  formatDateTime: vi.fn((ts) => `formatted-${ts}`),
  formatTime: vi.fn(),
  formatDate: vi.fn(),
}));

// Mock db.js functions
vi.mock('../db.js', () => ({
  exportAll: vi.fn(),
  importAll: vi.fn(),
  clearAll: vi.fn(),
}));

// Now import after mocks are set up
import { getCompetitionGoal, setCompetitionGoal, renderSettings } from './settings.js';
import { exportAll, importAll, clearAll } from '../db.js';
import { toast } from '../ui.js';

describe('settings.js', () => {
  let container;

  beforeEach(() => {
    // Clear all mocks
    vi.clearAllMocks();

    // Clear localStorage
    localStorage.clear();

    // Create container for rendering
    container = document.createElement('div');
    document.body.appendChild(container);

    // Mock URL methods
    global.URL.createObjectURL = vi.fn(() => 'blob:http://localhost/blob123');
    global.URL.revokeObjectURL = vi.fn();

    // Mock prompt and confirm
    global.prompt = vi.fn();
    global.confirm = vi.fn(() => true);

    // Mock Blob
    class MockBlob {
      constructor(content, options) {
        this.content = content[0];
        this.type = options?.type;
        this.bytes = content;
      }
    }
    global.Blob = MockBlob;

    // Mock FileReader for import
    global.FileReader = vi.fn(() => ({
      readAsText: vi.fn(),
      onload: null,
      onerror: null,
      result: null,
    }));
  });

  afterEach(() => {
    // Clean up container
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  describe('getCompetitionGoal', () => {
    it('returns null when no config exists', () => {
      expect(getCompetitionGoal()).toBeNull();
    });

    it('returns null when config is empty', () => {
      localStorage.setItem('walk-cycle-config', JSON.stringify({}));
      expect(getCompetitionGoal()).toBeNull();
    });

    it('returns null when config has no competitionGoal', () => {
      localStorage.setItem('walk-cycle-config', JSON.stringify({ other: 'value' }));
      expect(getCompetitionGoal()).toBeNull();
    });

    it('returns competitionGoal when set', () => {
      const goal = { ups: 9, endTime: '17:00' };
      localStorage.setItem('walk-cycle-config', JSON.stringify({ competitionGoal: goal }));
      expect(getCompetitionGoal()).toEqual(goal);
    });

    it('returns null when config JSON is invalid', () => {
      localStorage.setItem('walk-cycle-config', 'invalid-json');
      expect(getCompetitionGoal()).toBeNull();
    });
  });

  describe('setCompetitionGoal', () => {
    it('saves competitionGoal to localStorage', () => {
      const goal = { ups: 9, endTime: '17:00' };
      setCompetitionGoal(goal);

      const saved = JSON.parse(localStorage.getItem('walk-cycle-config'));
      expect(saved.competitionGoal).toEqual(goal);
    });

    it('preserves other config values when setting competitionGoal', () => {
      localStorage.setItem('walk-cycle-config', JSON.stringify({ other: 'value' }));
      const goal = { ups: 5, endTime: '16:00' };
      setCompetitionGoal(goal);

      const saved = JSON.parse(localStorage.getItem('walk-cycle-config'));
      expect(saved.competitionGoal).toEqual(goal);
      expect(saved.other).toBe('value');
    });

    it('can set competitionGoal to null', () => {
      localStorage.setItem('walk-cycle-config', JSON.stringify({ competitionGoal: { ups: 9 } }));
      setCompetitionGoal(null);

      const saved = JSON.parse(localStorage.getItem('walk-cycle-config'));
      expect(saved.competitionGoal).toBeNull();
    });
  });

  describe('renderSettings', () => {
    it('renders all sections', async () => {
      await renderSettings(container);

      expect(container.querySelector('h2').textContent).toBe('Settings');
      expect(container.textContent).toContain('Competition goal');
      expect(container.textContent).toContain('Backup');
      expect(container.textContent).toContain('Danger zone');
      expect(container.textContent).toContain('About');
    });

    it('renders competition goal section with inputs', async () => {
      await renderSettings(container);

      const upsInput = container.querySelector('#goal-ups');
      const timeInput = container.querySelector('#goal-time');

      expect(upsInput).toBeTruthy();
      expect(upsInput.type).toBe('number');
      expect(timeInput).toBeTruthy();
      expect(timeInput.type).toBe('time');
    });

    it('loads existing competition goal values into inputs', async () => {
      const goal = { ups: 9, endTime: '17:00' };
      setCompetitionGoal(goal);

      await renderSettings(container);

      const upsInput = container.querySelector('#goal-ups');
      const timeInput = container.querySelector('#goal-time');

      expect(upsInput.value).toBe('9');
      expect(timeInput.value).toBe('17:00');
    });

    it('saves competition goal on ups input change', async () => {
      await renderSettings(container);

      const upsInput = container.querySelector('#goal-ups');
      upsInput.value = '12';
      upsInput.dispatchEvent(new Event('change'));

      const saved = getCompetitionGoal();
      expect(saved).toEqual({ ups: 12, endTime: null });
    });

    it('saves competition goal on time input change', async () => {
      await renderSettings(container);

      const timeInput = container.querySelector('#goal-time');
      timeInput.value = '18:30';
      timeInput.dispatchEvent(new Event('change'));

      const saved = getCompetitionGoal();
      expect(saved).toEqual({ ups: null, endTime: '18:30' });
    });

    it('clears competition goal when both inputs are empty', async () => {
      setCompetitionGoal({ ups: 9, endTime: '17:00' });
      await renderSettings(container);

      const upsInput = container.querySelector('#goal-ups');
      const timeInput = container.querySelector('#goal-time');

      upsInput.value = '';
      timeInput.value = '';
      upsInput.dispatchEvent(new Event('change'));

      expect(getCompetitionGoal()).toBeNull();
    });

    it('renders backup section with export and import buttons', async () => {
      await renderSettings(container);

      expect(container.textContent).toContain('Export JSON backup');
      expect(container.textContent).toContain('Import JSON…');
      expect(container.textContent).toContain('Merge with existing data');
    });

    it('renders danger zone with delete button', async () => {
      await renderSettings(container);

      expect(container.textContent).toContain('Delete all data');
      expect(container.textContent).toContain('permanently delete');
    });

    it('renders about section', async () => {
      await renderSettings(container);

      expect(container.textContent).toMatch(/Walk Cycle · .+? · /);
      expect(container.textContent).toContain('Local-first · works offline');
    });
  });

  describe('export functionality', () => {
    it('calls exportAll and triggers download', async () => {
      const mockData = {
        sessions: [{ id: 1, createdAt: Date.now() }],
        events: [{ id: 1, sessionId: 1, type: 'up' }],
      };
      exportAll.mockResolvedValueOnce(mockData);

      await renderSettings(container);

      const exportBtn = container.querySelector('.btn-primary');
      exportBtn.click();

      // Wait for async doExport
      await new Promise((r) => setTimeout(r, 0));

      expect(exportAll).toHaveBeenCalled();
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith(
        'Exported 1 session and 1 event',
      );
    });

    it('generates correct filename with timestamp', async () => {
      const mockData = { sessions: [], events: [] };
      exportAll.mockResolvedValueOnce(mockData);

      await renderSettings(container);

      const exportBtn = container.querySelector('.btn-primary');
      exportBtn.click();

      await new Promise((r) => setTimeout(r, 0));

      const blobCall = global.URL.createObjectURL.mock.calls[0];
      expect(blobCall).toBeTruthy();
    });

    it('shows toast on export failure', async () => {
      exportAll.mockRejectedValueOnce(new Error('DB error'));

      await renderSettings(container);

      const exportBtn = container.querySelector('.btn-primary');
      exportBtn.click();

      await new Promise((r) => setTimeout(r, 0));

      expect(toast).toHaveBeenCalledWith('Export failed');
    });
  });

  describe('import functionality', () => {
    it('calls importAll with merge option when checkbox checked', async () => {
      importAll.mockResolvedValueOnce(undefined);

      await renderSettings(container);

      const mergeChk = container.querySelector('#merge-chk');
      const importInput = container.querySelector('input[type="file"]');

      mergeChk.checked = true;

      const file = new File(
        [JSON.stringify({ sessions: [{ id: 1 }], events: [], exportedAt: Date.now() })],
        'backup.json',
        { type: 'application/json' },
      );

      Object.defineProperty(importInput, 'files', {
        value: [file],
        writable: false,
      });

      // Mock confirm to return true
      global.confirm.mockReturnValueOnce(true);

      importInput.dispatchEvent(new Event('change'));

      await new Promise((r) => setTimeout(r, 0));

      expect(importAll).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ merge: true }),
      );
    });

    it('calls importAll without merge when checkbox unchecked', async () => {
      importAll.mockResolvedValueOnce(undefined);

      await renderSettings(container);

      const importInput = container.querySelector('input[type="file"]');

      const file = new File(
        [JSON.stringify({ sessions: [], events: [], exportedAt: Date.now() })],
        'backup.json',
        { type: 'application/json' },
      );

      Object.defineProperty(importInput, 'files', {
        value: [file],
        writable: false,
      });

      global.confirm.mockReturnValueOnce(true);

      importInput.dispatchEvent(new Event('change'));

      await new Promise((r) => setTimeout(r, 0));

      expect(importAll).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ merge: false }),
      );
    });

    it('shows toast on successful import', async () => {
      importAll.mockResolvedValueOnce(undefined);

      await renderSettings(container);

      const importInput = container.querySelector('input[type="file"]');

      const file = new File(
        [JSON.stringify({ sessions: [{ id: 1 }], events: [], exportedAt: Date.now() })],
        'backup.json',
        { type: 'application/json' },
      );

      Object.defineProperty(importInput, 'files', {
        value: [file],
        writable: false,
      });

      global.confirm.mockReturnValueOnce(true);

      importInput.dispatchEvent(new Event('change'));

      await new Promise((r) => setTimeout(r, 0));

      expect(toast).toHaveBeenCalledWith('Import successful');
    });

    it('cancels import when confirm returns false', async () => {
      await renderSettings(container);

      const importInput = container.querySelector('input[type="file"]');

      const file = new File(
        [JSON.stringify({ sessions: [], events: [] })],
        'backup.json',
        { type: 'application/json' },
      );

      Object.defineProperty(importInput, 'files', {
        value: [file],
        writable: false,
      });

      global.confirm.mockReturnValueOnce(false);

      importInput.dispatchEvent(new Event('change'));

      await new Promise((r) => setTimeout(r, 0));

      expect(importAll).not.toHaveBeenCalled();
    });

    it('handles import failure', async () => {
      importAll.mockRejectedValueOnce(new Error('Invalid data'));

      await renderSettings(container);

      const importInput = container.querySelector('input[type="file"]');

      const file = new File(
        [JSON.stringify({ sessions: [], events: [] })],
        'backup.json',
        { type: 'application/json' },
      );

      Object.defineProperty(importInput, 'files', {
        value: [file],
        writable: false,
      });

      global.confirm.mockReturnValueOnce(true);

      importInput.dispatchEvent(new Event('change'));

      await new Promise((r) => setTimeout(r, 0));

      expect(toast).toHaveBeenCalledWith('Import failed: Invalid data');
    });
  });

  describe('delete all functionality', () => {
    it('calls clearAll when prompt returns DELETE', async () => {
      clearAll.mockResolvedValueOnce(undefined);
      global.prompt.mockReturnValueOnce('DELETE');

      await renderSettings(container);

      const deleteBtn = container.querySelector('.btn-danger');
      deleteBtn.click();

      await new Promise((r) => setTimeout(r, 0));

      expect(clearAll).toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith('All data deleted');
    });

    it('does not call clearAll when prompt returns wrong phrase', async () => {
      global.prompt.mockReturnValueOnce('wrong');

      await renderSettings(container);

      const deleteBtn = container.querySelector('.btn-danger');
      deleteBtn.click();

      await new Promise((r) => setTimeout(r, 0));

      expect(clearAll).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith('Cancelled');
    });

    it('does not call clearAll when prompt returns null (cancelled)', async () => {
      global.prompt.mockReturnValueOnce(null);

      await renderSettings(container);

      const deleteBtn = container.querySelector('.btn-danger');
      deleteBtn.click();

      await new Promise((r) => setTimeout(r, 0));

      expect(clearAll).not.toHaveBeenCalled();
      expect(toast).toHaveBeenCalledWith('Cancelled');
    });
  });
});
