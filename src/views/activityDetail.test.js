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
    vi.resetAllMocks();
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
    expect(items[0].textContent).toContain('2026');
    expect(items[0].textContent).toContain('3');
    expect(items[1].textContent).toContain('2026');
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

  it('shows motivation chart with day/week toggle when goal is set', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000, goal: 52 });
    mockDb.listRecordsByActivity.mockResolvedValue([]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const chartCard = Array.from(target.querySelectorAll('.card')).find(
      c => c.querySelector('h3')?.textContent === 'Motivation'
    );
    const buttons = chartCard.querySelectorAll('button');
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent).toBe('Day');
    expect(buttons[1].textContent).toBe('Week');
    expect(buttons[2].textContent).toContain('Reset');
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
    expect(dateSpan.textContent).toBe(new Date('2026-05-10T00:00:00').toLocaleDateString());
    dateSpan.click();

    const dateInput = target.querySelector('input[data-edit="date-input"]');
    expect(dateInput).toBeTruthy();
    expect(dateInput.style.display).not.toBe('none');

    dateInput.value = '2026-06-01';
    dateInput.dispatchEvent(new Event('blur', { bubbles: true }));

    await new Promise(r => setTimeout(r, 0));

    expect(mockDb.updateRecord).toHaveBeenCalledWith(10, { date: '2026-06-01' });
  });

  it('shows written checkbox for each record', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 3, written: false },
      { id: 11, date: '2026-05-09', count: 1, written: true },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const checkboxes = target.querySelectorAll('input[data-edit="written"]');
    expect(checkboxes.length).toBe(2);
    expect(checkboxes[0].checked).toBe(false);
    expect(checkboxes[1].checked).toBe(true);
  });

  it('does not update date when unchanged', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 3 },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const dateSpan = target.querySelector('span[data-edit="date"]');
    dateSpan.click();

    const dateInput = target.querySelector('input[data-edit="date-input"]');
    dateInput.dispatchEvent(new Event('blur', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));

    expect(mockDb.updateRecord).not.toHaveBeenCalled();
    expect(dateSpan.style.display).not.toBe('none');
    expect(dateInput.style.display).toBe('none');
  });

  it('shows toast when date conflicts with existing record', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity
      .mockResolvedValueOnce([
        { id: 10, date: '2026-05-10', count: 3 },
        { id: 11, date: '2026-06-01', count: 1 },
      ])
      .mockResolvedValueOnce([
        { id: 10, date: '2026-05-10', count: 3 },
        { id: 11, date: '2026-06-01', count: 1 },
      ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const dateSpans = target.querySelectorAll('span[data-edit="date"]');
    dateSpans[0].click();

    const dateInputs = target.querySelectorAll('input[data-edit="date-input"]');
    dateInputs[0].value = '2026-06-01';
    dateInputs[0].dispatchEvent(new Event('blur', { bubbles: true }));
    await new Promise(r => setTimeout(r, 0));

    expect(mockToast).toHaveBeenCalledWith('Record already exists for this date');
    expect(mockDb.updateRecord).not.toHaveBeenCalled();
    expect(dateInputs[0].value).toBe('2026-05-10');
  });

  it('saves date on Enter key', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 3 },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const dateSpan = target.querySelector('span[data-edit="date"]');
    dateSpan.click();

    const dateInput = target.querySelector('input[data-edit="date-input"]');
    dateInput.value = '2026-06-01';
    dateInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(r => setTimeout(r, 0));

    expect(mockDb.updateRecord).toHaveBeenCalledWith(10, { date: '2026-06-01' });
  });

  it('does not update count when unchanged', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 3 },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const countSpan = target.querySelector('span[data-edit="count"]');
    countSpan.click();

    const countInput = target.querySelector('input[data-edit="count-input"]');
    countInput.dispatchEvent(new Event('blur'));
    await new Promise(r => setTimeout(r, 0));

    expect(mockDb.updateRecord).not.toHaveBeenCalled();
    expect(countSpan.style.display).not.toBe('none');
    expect(countInput.style.display).toBe('none');
  });

  it('saves count on Enter key', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 3 },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const countSpan = target.querySelector('span[data-edit="count"]');
    countSpan.click();

    const countInput = target.querySelector('input[data-edit="count-input"]');
    countInput.value = '5';
    countInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(r => setTimeout(r, 0));

    expect(mockDb.updateRecord).toHaveBeenCalledWith(10, { count: 5 });
  });

  it('clears goal when input is empty', async () => {
    mockDb.getActivity
      .mockResolvedValueOnce({ id: 1, name: 'Hills', createdAt: 3000, goal: 52 })
      .mockResolvedValueOnce({ id: 1, name: 'Hills', createdAt: 3000, goal: null });
    mockDb.listRecordsByActivity.mockResolvedValue([]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const square = target.querySelector('span[data-edit="goal"]');
    square.click();

    const input = target.querySelector('input[data-edit="goal-input"]');
    input.value = '';
    input.dispatchEvent(new Event('blur'));
    await new Promise(r => setTimeout(r, 0));

    expect(mockDb.updateActivity).toHaveBeenCalledWith(1, { goal: null });
  });

  it('saves goal on Enter key', async () => {
    mockDb.getActivity
      .mockResolvedValueOnce({ id: 1, name: 'Hills', createdAt: 3000 })
      .mockResolvedValueOnce({ id: 1, name: 'Hills', createdAt: 3000, goal: 42 });
    mockDb.listRecordsByActivity.mockResolvedValue([]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const square = target.querySelector('span[data-edit="goal"]');
    square.click();

    const input = target.querySelector('input[data-edit="goal-input"]');
    input.value = '42';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(r => setTimeout(r, 0));

    expect(mockDb.updateActivity).toHaveBeenCalledWith(1, { goal: 42 });
  });

  it('switches to day mode when Day button is clicked', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000, goal: 52 });
    mockDb.listRecordsByActivity.mockResolvedValue([]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const chartCard = Array.from(target.querySelectorAll('.card')).find(
      c => c.querySelector('h3')?.textContent === 'Motivation'
    );
    const buttons = chartCard.querySelectorAll('button');
    const dayBtn = buttons[0];
    const weekBtn = buttons[1];

    expect(dayBtn.style.background).toBe('transparent');
    expect(weekBtn.style.background).toBe('var(--fg)');

    dayBtn.click();

    expect(dayBtn.style.background).toBe('var(--fg)');
    expect(weekBtn.style.background).toBe('transparent');
  });

  it('switches back to week mode when Week button is clicked after Day', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000, goal: 52 });
    mockDb.listRecordsByActivity.mockResolvedValue([]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const chartCard = Array.from(target.querySelectorAll('.card')).find(
      c => c.querySelector('h3')?.textContent === 'Motivation'
    );
    const buttons = chartCard.querySelectorAll('button');
    const dayBtn = buttons[0];
    const weekBtn = buttons[1];

    dayBtn.click();
    weekBtn.click();

    expect(weekBtn.style.background).toBe('var(--fg)');
    expect(dayBtn.style.background).toBe('transparent');
  });

  it('shows and clicks reset zoom button', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000, goal: 52 });
    mockDb.listRecordsByActivity.mockResolvedValue([]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const chartCard = Array.from(target.querySelectorAll('.card')).find(
      c => c.querySelector('h3')?.textContent === 'Motivation'
    );
    const buttons = chartCard.querySelectorAll('button');
    const resetBtn = buttons[2];

    expect(resetBtn.style.display).toBe('none');

    resetBtn.click();
    expect(resetBtn.style.display).toBe('none');
  });

  it('toggles written when checkbox is clicked', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity
      .mockResolvedValueOnce([
        { id: 10, date: '2026-05-10', count: 3, written: false },
      ])
      .mockResolvedValueOnce([
        { id: 10, date: '2026-05-10', count: 3, written: false },
      ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const checkbox = target.querySelector('input[data-edit="written"]');
    expect(checkbox.checked).toBe(false);

    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(r => setTimeout(r, 0));

    expect(mockDb.updateRecord).toHaveBeenCalledWith(10, { written: true });
  });

  it('shows note text when present, empty when not, and supports inline edit', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity
      .mockResolvedValueOnce([
        { id: 10, date: '2026-05-10', count: 3, note: 'Park entrance' },
        { id: 11, date: '2026-05-09', count: 1, note: '' },
      ])
      .mockResolvedValueOnce([
        { id: 10, date: '2026-05-10', count: 3, note: 'Park entrance' },
        { id: 11, date: '2026-05-09', count: 1, note: '' },
      ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    expect(target.textContent).toContain('Park entrance');

    const noteSpans = target.querySelectorAll('span[data-edit="note"]');
    expect(noteSpans.length).toBe(2);
    expect(noteSpans[0].textContent).toBe('Park entrance');
    expect(noteSpans[1].textContent).toBe('');

    noteSpans[0].click();
    const noteInputs = target.querySelectorAll('input[data-edit="note-input"]');
    expect(noteInputs[0].style.display).not.toBe('none');
    expect(noteInputs[0].value).toBe('Park entrance');

    noteInputs[0].value = 'River trail';
    noteInputs[0].dispatchEvent(new Event('blur'));
    await new Promise(r => setTimeout(r, 0));

    expect(mockDb.updateRecord).toHaveBeenCalledWith(10, { note: 'River trail' });
  });

  it('opens note input when clicking empty note placeholder', async () => {
    mockDb.getActivity.mockResolvedValue({ id: 1, name: 'Hills', createdAt: 3000 });
    mockDb.listRecordsByActivity.mockResolvedValue([
      { id: 10, date: '2026-05-10', count: 3, note: '' },
    ]);

    const { renderActivityDetail } = await import('./activityDetail.js');
    await renderActivityDetail(target, { id: 1 });

    const noteSpan = target.querySelector('span[data-edit="note"]');
    expect(noteSpan.textContent).toBe('');

    noteSpan.click();
    const noteInput = target.querySelector('input[data-edit="note-input"]');
    expect(noteInput.style.display).not.toBe('none');

    noteInput.value = 'Lake view';
    noteInput.dispatchEvent(new Event('blur'));
    await new Promise(r => setTimeout(r, 0));

    expect(mockDb.updateRecord).toHaveBeenCalledWith(10, { note: 'Lake view' });
  });

});
