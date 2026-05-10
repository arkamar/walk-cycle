import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('../db.js', () => ({
  createActivity: vi.fn(),
  listActivities: vi.fn(),
  deleteActivity: vi.fn(),
  listRecordsByActivity: vi.fn(),
}));

const mockDb = await import('../db.js');

function makeTarget() {
  const t = document.createElement('div');
  document.body.appendChild(t);
  return t;
}

const CURRENT_SESSION_KEY = 'walk-cycle-current-session-id';

describe('renderActivities', () => {
  let target;

  beforeEach(() => {
    target = makeTarget();
    vi.clearAllMocks();
    mockDb.listActivities.mockResolvedValue([]);
    mockDb.listRecordsByActivity.mockResolvedValue([]);
  });

  afterEach(() => {
    document.body.removeChild(target);
    localStorage.removeItem(CURRENT_SESSION_KEY);
  });

  it('shows heading and New Activity button', async () => {
    const { renderActivities } = await import('./activities.js');
    await renderActivities(target);
    expect(target.querySelector('h2').textContent).toBe('Activities');
    expect(target.querySelector('.btn-primary').textContent).toContain('New Activity');
  });

  it('shows empty state when no activities exist', async () => {
    const { renderActivities } = await import('./activities.js');
    await renderActivities(target);
    const empty = target.querySelector('.empty');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toContain('No activities');
  });

  it('renders a list of activities', async () => {
    mockDb.listActivities.mockResolvedValue([
      { id: 1, name: 'Hills', createdAt: 3000 },
      { id: 2, name: 'Trails', createdAt: 2000 },
    ]);
    mockDb.listRecordsByActivity
      .mockResolvedValueOnce([{ id: 10, date: '2026-05-10', count: 2 }])
      .mockResolvedValueOnce([]);

    const { renderActivities } = await import('./activities.js');
    await renderActivities(target);

    const items = target.querySelectorAll('.list-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('Hills');
    expect(items[1].textContent).toContain('Trails');
  });

  it('shows record count in meta', async () => {
    mockDb.listActivities.mockResolvedValue([
      { id: 1, name: 'Hills', createdAt: 3000 },
    ]);
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 2 },
    ]);

    const { renderActivities } = await import('./activities.js');
    await renderActivities(target);

    const meta = target.querySelector('.meta');
    expect(meta.textContent).toContain('1 record');
    expect(meta.textContent).toContain('2 total');
  });

  it('links each activity to its detail page', async () => {
    mockDb.listActivities.mockResolvedValue([
      { id: 1, name: 'Hills', createdAt: 3000 },
    ]);
    mockDb.listRecordsByActivity.mockResolvedValue([]);

    const { renderActivities } = await import('./activities.js');
    await renderActivities(target);

    const link = target.querySelector('a');
    expect(link.getAttribute('href')).toBe('#/activities/1');
  });

  it('creates activity and navigates to its detail on New Activity click', async () => {
    mockDb.createActivity.mockResolvedValue(42);

    const { renderActivities } = await import('./activities.js');
    await renderActivities(target);

    const btn = target.querySelector('.btn-primary');
    await btn.click();

    expect(mockDb.createActivity).toHaveBeenCalled();
    expect(window.location.hash).toBe('#/activities/42');
  });

  it('deletes activity and re-renders', async () => {
    mockDb.listActivities.mockResolvedValue([
      { id: 1, name: 'Hills', createdAt: 3000 },
    ]);
    mockDb.listRecordsByActivity.mockResolvedValue([]);
    window.confirm = vi.fn().mockReturnValue(true);

    const { renderActivities } = await import('./activities.js');
    await renderActivities(target);

    const deleteBtn = target.querySelector('.btn-ghost');
    await deleteBtn.click();

    expect(window.confirm).toHaveBeenCalledWith('Delete this activity?');
    expect(mockDb.deleteActivity).toHaveBeenCalledWith(1);
  });

  it('does not delete when cancelled', async () => {
    mockDb.listActivities.mockResolvedValue([
      { id: 1, name: 'Hills', createdAt: 3000 },
    ]);
    mockDb.listRecordsByActivity.mockResolvedValue([]);
    window.confirm = vi.fn().mockReturnValue(false);

    const { renderActivities } = await import('./activities.js');
    await renderActivities(target);

    const deleteBtn = target.querySelector('.btn-ghost');
    await deleteBtn.click();

    expect(mockDb.deleteActivity).not.toHaveBeenCalled();
  });
});
