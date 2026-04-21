/**
 * background.test.js — Unit-тесты для background.js
 */

beforeEach(() => {
  global.chrome = {
    storage: {
      local: {
        get: jest.fn(),
        set: jest.fn(),
        remove: jest.fn(),
      },
    },
    tabs: {
      update: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve()),
      create: jest.fn(() => Promise.resolve()),
    },
    action: {
      onClicked: { addListener: jest.fn() },
    },
    runtime: {
      onMessage: { addListener: jest.fn() },
      onInstalled: { addListener: jest.fn() },
      getURL: jest.fn((path) => `chrome-extension://test/${path}`),
      lastError: null,
    },
  };
});

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  delete global.chrome;
});

describe('Background', () => {
  test('createNewNote создает заметку и обновляет вкладку', async () => {
    chrome.storage.local.set.mockResolvedValue();

    const { createNewNote } = require('../../background.js');

    const result = await createNewNote('Заголовок', 123);

    expect(result.success).toBe(true);
    expect(chrome.tabs.update).toHaveBeenCalledWith(123, expect.objectContaining({ url: expect.stringContaining('editor.html?noteId=') }));
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });

  test('getAllNotesSummary возвращает корректный список', async () => {
    chrome.storage.local.get.mockResolvedValue({
      note_1: { title: 'Тест', content: '<p>123</p>', timestamp: 1000, createdAt: 1000 },
      note_2: { title: '', content: '', timestamp: 500, createdAt: 500 },
    });

    const { getAllNotesSummary } = require('../../background.js');
    const summary = await getAllNotesSummary();

    expect(summary).toHaveLength(2);
    expect(summary[0].id).toBe('1');
    expect(summary[0].title).toBe('Тест');
    expect(summary[1].title).toBe('');
  });

  test('saveNote обновляет существующую заметку', async () => {
    chrome.storage.local.get.mockResolvedValue({ note_existing: { content: 'old', title: 'old' } });
    chrome.storage.local.set.mockResolvedValue();

    const { saveNote } = require('../../background.js');
    const result = await saveNote('existing', { content: '<p>new</p>', title: 'new' });

    expect(result.success).toBe(true);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ note_existing: expect.objectContaining({ content: '<p>new</p>', title: 'new' }) });
  });

  test('deleteNoteById удаляет заметку', async () => {
    chrome.storage.local.get
      .mockResolvedValueOnce({ note_abc: { title: 'T' } })
      .mockResolvedValueOnce({});
    chrome.storage.local.remove.mockResolvedValue();

    const { deleteNoteById } = require('../../background.js');
    const result = await deleteNoteById('abc');

    expect(result.success).toBe(true);
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('note_abc');
  });
});
