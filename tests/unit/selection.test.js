/**
 * selection.test.js — Unit-тесты для selection.js
 */

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  document.body.innerHTML = `
    <select id="notesSelect"></select>
    <div id="noNotesMessage"></div>
    <input id="newNoteTitle" />
    <button id="createBtn">Создать</button>
  `;

  global.chrome = {
    runtime: {
      sendMessage: jest.fn((message, callback) => callback([])),
      lastError: null,
    },
  };

  global.alert = jest.fn();
});

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  delete global.chrome;
  delete global.alert;
  delete process.env.NODE_ENV;
});

describe('Selection', () => {
  test('loadNotesList показывает сообщение при отсутствии заметок', async () => {
    chrome.runtime.sendMessage.mockImplementation((message, callback) => callback([]));
    const { loadNotesList } = require('../../selection.js');

    await loadNotesList();

    const notesSelect = document.getElementById('notesSelect');
    const noNotesMessage = document.getElementById('noNotesMessage');

    expect(notesSelect.disabled).toBe(true);
    expect(notesSelect.innerHTML).toContain('Нет заметок');
    expect(noNotesMessage.classList.contains('visible')).toBe(true);
  });

  test('loadNotesList отображает заметки, когда они есть', async () => {
    const notes = [{ id: '1', title: 'A', key: 'note_1' }, { id: '2', title: '', key: 'note_2' }];
    chrome.runtime.sendMessage.mockImplementation((message, callback) => callback(notes));
    const { loadNotesList } = require('../../selection.js');

    await loadNotesList();

    const notesSelect = document.getElementById('notesSelect');
    expect(notesSelect.disabled).toBe(false);
    expect(notesSelect.querySelectorAll('option')).toHaveLength(3);
    expect(notesSelect.querySelector('option[value="1"]').textContent).toBe('A');
    expect(notesSelect.querySelector('option[value="2"]').textContent).toBe('note_2');
  });

  test('updateCreateButtonState отключает кнопку без заголовка', () => {
    const { updateCreateButtonState } = require('../../selection.js');
    const createBtn = document.getElementById('createBtn');
    const newNoteTitleInput = document.getElementById('newNoteTitle');

    newNoteTitleInput.value = '   ';
    updateCreateButtonState();
    expect(createBtn.disabled).toBe(true);

    newNoteTitleInput.value = 'Тест';
    updateCreateButtonState();
    expect(createBtn.disabled).toBe(false);
  });

  test('createNewNote не создает заметку без заголовка', async () => {
    const { createNewNote } = require('../../selection.js');
    const createBtn = document.getElementById('createBtn');
    const newNoteTitleInput = document.getElementById('newNoteTitle');

    newNoteTitleInput.value = '';
    await createNewNote();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(createBtn.disabled).toBe(false);
  });

  test('openExistingNote вызывает sendMessage при наличии id', async () => {
    chrome.runtime.sendMessage.mockImplementation((message, callback) => callback({ success: true }));
    const { openExistingNote } = require('../../selection.js');

    await openExistingNote('123');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'OPEN_NOTE', noteId: '123' }, expect.any(Function));
  });
});
