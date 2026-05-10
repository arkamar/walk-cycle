import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

const mockToast = vi.fn();

vi.mock('../ui.js', async () => {
  const actual = await import('../ui.js');
  return { ...actual, toast: mockToast };
});

vi.mock('../db.js', () => ({
  getActivity: vi.fn(),
  updateActivity: vi.fn(),
  addRecord: vi.fn(),
  listRecordsByActivity: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
}));

const mockDb = await import('../db.js');

function makeTarget() {
  const t = document.createElement('div');
  document.body.appendChild(t);
  return t;
}

describe('renderActivityDetail', () => {
  let target;

  beforeEach(() => {
    target = makeTarget();
    vi.clearAllMocks();
    mockToast.mockClear();
  });

  afterEach(() => {
    document.body.removeChild(target);
  });

  it('shows not found for non-existent activity', async () => {
    mockDb.getActivity.mockResolvedValue(undefined);
    mockDb.listRecordsByActivity.mockResolvedValue([]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 999 });

    expect(target.textContent).toContain('Activity not found');
    const backLink = target.querySelector('a');
    expect(backLink.getAttribute('href')).toBe('#/activities');
  });

  it('renders activity name and back link', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const backLink = target.querySelector('a');
    expect(backLink.getAttribute('href')).toBe('#/activities');
    const nameInput = target.querySelector('input[type="text"]');
    expect(nameInput.value).toBe('Hills');
  });

  it('updates activity name on input change', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const nameInput = target.querySelector('input[type="text"]');
    nameInput.value = 'Mountains';
    nameInput.dispatchEvent(new Event('change', { bubbles: true }));

    expect(mockDb.updateActivity).toHaveBeenCalledWith(1, { name: 'Mountains' });
  });

  it('renders add form with date and count inputs', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const dateInput = target.querySelector('input[type="date"]');
    expect(dateInput).toBeTruthy();
    const countInput = target.querySelector('input[type="number"]');
    expect(countInput).toBeTruthy();
    const addBtn = target.querySelector('.btn-primary');
    expect(addBtn.textContent).toContain('Add');
  });

  it('adds a record and re-renders', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 10, date: '2026-05-10', count: 3 },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const dateInput = target.querySelector('input[type="date"]');
    const countInput = target.querySelector('input[type="number"]');
    dateInput.value = '2026-05-10';
    countInput.value = '3';

    const addBtn = target.querySelector('.btn-primary');
    await addBtn.click();

    expect(mockDb.addRecord).toHaveBeenCalledWith({ activityId: 1, date: '2026-05-10', count: 3 });
  });

  it('shows toast error when addRecord rejects', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([]);
    mockDb.addRecord.mockRejectedValue(new Error('Record already exists for 2026-05-10'));

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const dateInput = target.querySelector('input[type="date"]');
    const countInput = target.querySelector('input[type="number"]');
    dateInput.value = '2026-05-10';
    countInput.value = '3';

    const addBtn = target.querySelector('.btn-primary');
    await addBtn.click();

    expect(mockToast).toHaveBeenCalledWith('Record already exists for 2026-05-10');
  });

  it('renders list of records sorted by date desc', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 3 },
      { id: 9, date: '2026-05-01', count: 1 },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const items = target.querySelectorAll('.list-item');
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain('2026-05-10');
    expect(items[0].textContent).toContain('3');
    expect(items[1].textContent).toContain('2026-05-01');
    expect(items[1].textContent).toContain('1');
  });

  it('shows empty state when no records exist', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    expect(target.textContent).toContain('No records yet');
  });

  function findDeleteBtn() {
    const buttons = target.querySelectorAll('.btn-ghost');
    return Array.from(buttons).find(b => b.textContent === '🗑');
  }

  it('deletes a record and re-renders', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValueOnce([
      { id: 10, date: '2026-05-10', count: 3 },
    ]).mockResolvedValueOnce([]);
    window.confirm = vi.fn().mockReturnValue(true);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const deleteBtn = findDeleteBtn();
    await deleteBtn.click();

    expect(mockDb.deleteRecord).toHaveBeenCalledWith(10);
  });

  it('does not delete record when cancelled', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 3 },
    ]);
    window.confirm = vi.fn().mockReturnValue(false);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const deleteBtn = findDeleteBtn();
    await deleteBtn.click();

    expect(mockDb.deleteRecord).not.toHaveBeenCalled();
  });

  it('edits count inline when clicking the count text', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 3 },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const countSpan = target.querySelector('span[data-edit="count"]');
    expect(countSpan).toBeTruthy();
    countSpan.click();

    const editInput = target.querySelector('input[data-edit="count-input"]');
    expect(editInput).toBeTruthy();
    expect(Number(editInput.value)).toBe(3);

    editInput.value = '5';
    editInput.dispatchEvent(new Event('blur'));

    expect(mockDb.updateRecord).toHaveBeenCalledWith(10, { count: 5 });
  });
});
