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
    const countInput = target.querySelector('input[data-form="count"]');
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
    const countInput = target.querySelector('input[data-form="count"]');
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
    const countInput = target.querySelector('input[data-form="count"]');
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

  it('shows stats with total, year count and goal square', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 3 },
      { id: 9, date: '2026-05-01', count: 1 },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    expect(target.textContent).toContain('Total');
    expect(target.textContent).toContain('4');
    expect(target.textContent).toContain('2026');
    expect(target.textContent).toContain('—');
  });

  it('shows projection when goal is set', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000, goal: 52 });
    // Enough 2026 records so projection exceeds 52 regardless of test date
    const records = Array.from({ length: 60 }, (_, i) => ({
      id: 10 + i, date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`, count: 1,
    }));
    mockDb.listRecordsByActivity.mockResolvedValue(records);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    expect(target.textContent).toContain('Projected');
    expect(target.textContent).toContain('✅ on track');
  });

  it('shows remaining count when year count is below goal', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000, goal: 52 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 12 },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    expect(target.textContent).toContain('40');
    expect(target.textContent).toContain('to go');
  });

  it('shows over count when year count exceeds goal', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000, goal: 10 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 12 },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    expect(target.textContent).toContain('2');
    expect(target.textContent).toContain('above goal');
  });

  it('does not show projection when goal is not set', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 3 },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    expect(target.textContent).not.toContain('✅');
    expect(target.textContent).not.toContain('📉');
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

    await new Promise(r => setTimeout(r, 0));

    expect(mockDb.updateRecord).toHaveBeenCalledWith(10, { count: 5 });
  });

  it('edits goal inline when clicking the goal square', async () => {
    mockDb.getActivity
      .mockResolvedValueOnce({ id: 1, name: 'Hills', createdAt: 3000 })
      .mockResolvedValueOnce({ id: 1, name: 'Hills', createdAt: 3000, goal: 42 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 3 },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const square = target.querySelector('span[data-edit="goal"]');
    expect(square).toBeTruthy();
    expect(square.textContent).toBe('—');
    square.click();

    const input = target.querySelector('input[data-edit="goal-input"]');
    expect(input).toBeTruthy();
    expect(input.value).toBe('');

    input.value = '42';
    input.dispatchEvent(new Event('blur'));

    await new Promise(r => setTimeout(r, 0));

    expect(mockDb.updateActivity).toHaveBeenCalledWith(1, { goal: 42 });
  });

  it('edits date inline when clicking the date text', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 3 },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const dateSpan = target.querySelector('span[data-edit="date"]');
    expect(dateSpan).toBeTruthy();
    expect(dateSpan.textContent).toBe('2026-05-10');
    dateSpan.click();

    const dateInput = target.querySelector('input[data-edit="date-input"]');
    expect(dateInput).toBeTruthy();
    expect(dateInput.style.display).not.toBe('none');

    dateInput.value = '2026-06-01';
    dateInput.dispatchEvent(new Event('blur', { bubbles: true }));

    await new Promise(r => setTimeout(r, 0));

    expect(mockDb.updateRecord).toHaveBeenCalledWith(10, { date: '2026-06-01' });
  });
});
