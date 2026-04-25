/**
 * selection.test.js — Unit-тесты для selection.js
 */

beforeEach(() => {
  process.env.NODE_ENV = 'test';
  
  // Базовая HTML структура главной страницы с custom dropdown
  document.body.innerHTML = `
    <select id="notesSelect"></select>
    <span id="noNotesMessage"></span>
    <input id="newNoteTitle" />
    <button id="createBtn">Создать</button>
    <button id="debugBtn" title="Показать все заметки">🔍</button>
    <button id="themeToggleBtn">🌙</button>
    <div id="debugModal" class="hidden">
      <div class="modal-content">
        <button id="closeModal">✕</button>
        <table class="debug-table">
          <thead>
            <tr>
              <th>Ключ</th>
              <th>Заголовок</th>
              <th>Контент</th>
              <th>Время</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody id="debugTableBody"></tbody>
        </table>
      </div>
    </div>
    <div id="customDropdown">
      <button id="dropdownTrigger">
        <span class="dropdown-selected-text">Выберите заметку...</span>
        <span class="dropdown-arrow">▼</span>
      </button>
      <ul id="dropdownMenu" class="hidden"></ul>
    </div>
  `;

  // Мок chrome API
  global.chrome = {
    runtime: {
      sendMessage: jest.fn((message, callback) => callback([])),
      lastError: null,
    },
  };

  global.alert = jest.fn();
  global.confirm = jest.fn(() => true);
  global.localStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
  };
});

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  delete global.chrome;
  delete global.alert;
  delete global.confirm;
  delete global.localStorage;
  delete process.env.NODE_ENV;
});

describe('Selection — sendToBackground', () => {
  test('отправляет сообщение в chrome.runtime', async () => {
    const { sendToBackground } = require('../../selection.js');
    await sendToBackground('TEST_MESSAGE', { data: 'test' });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'TEST_MESSAGE', data: 'test' },
      expect.any(Function)
    );
  });

  test('выбрасывает ошибку при chrome.runtime.lastError', async () => {
    chrome.runtime.lastError = { message: 'Error message' };
    const { sendToBackground } = require('../../selection.js');
    await expect(sendToBackground('TEST_MESSAGE')).rejects.toThrow('Error message');
  });

  test('возвращает response при успехе', async () => {
    const mockResponse = { success: true, data: 'test' };
    chrome.runtime.sendMessage.mockImplementation((message, callback) => callback(mockResponse));
    const { sendToBackground } = require('../../selection.js');
    const result = await sendToBackground('TEST_MESSAGE');
    expect(result).toEqual(mockResponse);
  });
});

describe('Selection — loadNotesList', () => {
  test('показывает "Нет заметок" при пустом хранилище', async () => {
    chrome.runtime.sendMessage.mockImplementation((message, callback) => callback([]));
    const { loadNotesList } = require('../../selection.js');
    await loadNotesList();

    const notesSelect = document.getElementById('notesSelect');
    const noNotesMessage = document.getElementById('noNotesMessage');
    expect(notesSelect.disabled).toBe(true);
    expect(noNotesMessage.classList.contains('visible')).toBe(true);
  });

  test('загружает список заметок', async () => {
    const notes = [{ id: '1', title: 'Заметка 1', key: 'note_1' }];
    chrome.runtime.sendMessage.mockImplementation((message, callback) => callback(notes));
    const { loadNotesList } = require('../../selection.js');
    await loadNotesList();

    const notesSelect = document.getElementById('notesSelect');
    const noNotesMessage = document.getElementById('noNotesMessage');
    expect(notesSelect.disabled).toBe(false);
    expect(noNotesMessage.classList.contains('visible')).toBe(false);
  });

  test('использует key как заголовок если title пустой', async () => {
    const notes = [{ id: '1', title: '', key: 'note_test' }];
    chrome.runtime.sendMessage.mockImplementation((message, callback) => callback(notes));
    const { loadNotesList } = require('../../selection.js');
    await loadNotesList();

    const notesSelect = document.getElementById('notesSelect');
    expect(notesSelect.querySelector('option[value="1"]').textContent).toBe('note_test');
  });

  test('обрабатывает ошибку загрузки', async () => {
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      throw new Error('Load error');
    });
    const { loadNotesList } = require('../../selection.js');
    await loadNotesList();

    const notesSelect = document.getElementById('notesSelect');
    expect(notesSelect.innerHTML).toContain('Ошибка загрузки');
    expect(notesSelect.disabled).toBe(true);
  });

  test('не делает ничего если notesSelect отсутствует', async () => {
    document.getElementById('notesSelect').remove();
    const { loadNotesList } = require('../../selection.js');
    await loadNotesList();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });
});

describe('Selection — updateCreateButtonState', () => {
  test('отключает кнопку при пустом заголовке', () => {
    const { updateCreateButtonState } = require('../../selection.js');
    const createBtn = document.getElementById('createBtn');
    const newNoteTitleInput = document.getElementById('newNoteTitle');

    newNoteTitleInput.value = '';
    updateCreateButtonState();
    expect(createBtn.disabled).toBe(true);
  });

  test('отключает кнопку при пробелах', () => {
    const { updateCreateButtonState } = require('../../selection.js');
    const createBtn = document.getElementById('createBtn');
    const newNoteTitleInput = document.getElementById('newNoteTitle');

    newNoteTitleInput.value = '   ';
    updateCreateButtonState();
    expect(createBtn.disabled).toBe(true);
  });

  test('активирует кнопку при вводе текста', () => {
    const { updateCreateButtonState } = require('../../selection.js');
    const createBtn = document.getElementById('createBtn');
    const newNoteTitleInput = document.getElementById('newNoteTitle');

    newNoteTitleInput.value = 'Моя заметка';
    updateCreateButtonState();
    expect(createBtn.disabled).toBe(false);
  });

  test('отключает кнопку при isProcessing', () => {
    const { updateCreateButtonState, _setProcessing } = require('../../selection.js');
    const createBtn = document.getElementById('createBtn');
    const newNoteTitleInput = document.getElementById('newNoteTitle');

    newNoteTitleInput.value = 'Текст';
    _setProcessing(true);
    updateCreateButtonState();
    expect(createBtn.disabled).toBe(true);
  });
});

describe('Selection — createNewNote', () => {
  test('не создает заметку без заголовка', async () => {
    const { createNewNote } = require('../../selection.js');
    const newNoteTitleInput = document.getElementById('newNoteTitle');

    newNoteTitleInput.value = '';
    await createNewNote();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('не создает заметку при isProcessing', async () => {
    const { createNewNote, _setProcessing } = require('../../selection.js');
    _setProcessing(true);

    await createNewNote();

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    _setProcessing(false);
  });

  test('вызывает CREATE_NOTE с заголовком', async () => {
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      callback({ success: true, noteId: 'new_note_123' });
    });
    const { createNewNote } = require('../../selection.js');
    const newNoteTitleInput = document.getElementById('newNoteTitle');

    newNoteTitleInput.value = 'Новая заметка';
    await createNewNote();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'CREATE_NOTE', title: 'Новая заметка' },
      expect.any(Function)
    );
  });

  test('показывает ошибку при неудаче', async () => {
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      callback({ success: false, error: 'Test error' });
    });
    const { createNewNote } = require('../../selection.js');
    const newNoteTitleInput = document.getElementById('newNoteTitle');

    newNoteTitleInput.value = 'Ошибочная заметка';
    await createNewNote();

    expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('Ошибка'));
  });

  test('сбрасывает инпут после успешного создания', async () => {
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      callback({ success: true, noteId: 'new_note' });
    });
    const { createNewNote } = require('../../selection.js');
    const newNoteTitleInput = document.getElementById('newNoteTitle');

    newNoteTitleInput.value = 'Новая';
    await createNewNote();

    expect(newNoteTitleInput.value).toBe('');
  });
});

describe('Selection — openExistingNote', () => {
  test('вызывает OPEN_NOTE с noteId', async () => {
    chrome.runtime.sendMessage.mockImplementation((message, callback) => callback({ success: true }));
    const { openExistingNote } = require('../../selection.js');

    await openExistingNote('test_note_123');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'OPEN_NOTE', noteId: 'test_note_123' },
      expect.any(Function)
    );
  });

  test('не вызывает ничего при пустом noteId', async () => {
    const { openExistingNote } = require('../../selection.js');
    await openExistingNote('');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('не вызывает ничего при isProcessing', async () => {
    const { openExistingNote, _setProcessing } = require('../../selection.js');
    _setProcessing(true);

    await openExistingNote('test_note');

    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    _setProcessing(false);
  });

  test('обрабатывает ошибку при открытии', async () => {
    chrome.runtime.sendMessage.mockImplementation(() => {
      throw new Error('Open error');
    });
    const { openExistingNote } = require('../../selection.js');
    
    await openExistingNote('test_note');
    expect(global.alert).toHaveBeenCalled();
  });
});

describe('Selection — Модальное окно', () => {
  test('toggleDebugModal: открывает модальное окно', async () => {
    const { toggleDebugModal } = require('../../selection.js');
    const debugModal = document.getElementById('debugModal');

    await toggleDebugModal(true);

    expect(debugModal.classList.contains('hidden')).toBe(false);
    expect(document.body.style.overflow).toBe('hidden');
  });

  test('toggleDebugModal: закрывает модальное окно', async () => {
    const { toggleDebugModal } = require('../../selection.js');
    const debugModal = document.getElementById('debugModal');

    await toggleDebugModal(true);
    await toggleDebugModal(false);

    expect(debugModal.classList.contains('hidden')).toBe(true);
    expect(document.body.style.overflow).toBe('');
  });

  test('populateDebugTable: заполняет таблицу данными', async () => {
    const notes = [
      { id: '1', key: 'note_1', title: 'Заметка 1', content: 'Контент 1', timestamp: '01.01.2024' },
      { id: '2', key: 'note_2', title: '', content: 'Контент 2', timestamp: '02.01.2024' }
    ];
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'DEBUG_DUMP') callback(notes);
      else callback([]);
    });
    const { populateDebugTable } = require('../../selection.js');

    await populateDebugTable();

    const tableBody = document.getElementById('debugTableBody');
    expect(tableBody.innerHTML).toContain('note_1');
    expect(tableBody.innerHTML).toContain('Заметка 1');
  });

  test('populateDebugTable: показывает сообщение при отсутствии заметок', async () => {
    chrome.runtime.sendMessage.mockImplementation((message, callback) => callback([]));
    const { populateDebugTable } = require('../../selection.js');

    await populateDebugTable();

    const tableBody = document.getElementById('debugTableBody');
    expect(tableBody.innerHTML).toContain('Нет заметок');
  });

  test('populateDebugTable: показывает ошибку при исключении', async () => {
    chrome.runtime.sendMessage.mockImplementation(() => { throw new Error('Test error'); });
    const { populateDebugTable } = require('../../selection.js');

    await populateDebugTable();

    const tableBody = document.getElementById('debugTableBody');
    expect(tableBody.innerHTML).toContain('Ошибка');
  });

  test('populateDebugTable: ничего не делает при отсутствующем debugTableBody', () => {
    document.getElementById('debugTableBody').remove();
    const { populateDebugTable } = require('../../selection.js');
    expect(() => populateDebugTable()).not.toThrow();
  });

  test('populateDebugTable: добавляет кнопки удаления', async () => {
    const notes = [{ id: 'test_id', key: 'note_test', title: 'Тест', content: 'Test', timestamp: '01.01.2024' }];
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'DEBUG_DUMP') callback(notes);
      else callback([]);
    });
    const { populateDebugTable } = require('../../selection.js');

    await populateDebugTable();

    const deleteButtons = document.querySelectorAll('.btn-delete-row');
    expect(deleteButtons.length).toBe(1);
  });

  test('удаление заметки вызывает DELETE_NOTE', async () => {
    const notes = [{ id: 'delete_me', key: 'note_delete', title: 'Удалить', content: 'X', timestamp: '01.01.2024' }];
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'DEBUG_DUMP') callback(notes);
      else if (message.type === 'DELETE_NOTE') callback({ success: true });
      else callback([]);
    });
    
    const { populateDebugTable } = require('../../selection.js');
    await populateDebugTable();

    document.querySelector('.btn-delete-row').click();
    await new Promise(resolve => setTimeout(resolve, 100));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'DELETE_NOTE', noteId: 'delete_me' },
      expect.any(Function)
    );
  });
});

describe('Selection — Тема', () => {
  test('переключает тему с light на dark', () => {
    const { initSelection } = require('../../selection.js');
    const themeToggleBtn = document.getElementById('themeToggleBtn');

    document.body.classList.add('light-theme');
    initSelection();

    themeToggleBtn.click();

    expect(document.body.classList.contains('dark-theme')).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith('theme', 'dark');
  });

  test('загружает сохраненную dark тему', () => {
    localStorage.getItem.mockReturnValue('dark');
    
    const { initSelection } = require('../../selection.js');
    initSelection();

    expect(document.body.classList.contains('dark-theme')).toBe(true);
  });

  test('загружает сохраненную light тему', () => {
    localStorage.getItem.mockReturnValue('light');
    
    const { initSelection } = require('../../selection.js');
    initSelection();

    expect(document.body.classList.contains('light-theme')).toBe(true);
  });
});

describe('Selection — initSelection', () => {
  test('инициализирует все обработчики событий', () => {
    const { initSelection } = require('../../selection.js');
    expect(() => initSelection()).not.toThrow();
  });

  test('работает без ошибок когда элементы отсутствуют', () => {
    document.body.innerHTML = '';
    const { initSelection } = require('../../selection.js');
    expect(() => initSelection()).not.toThrow();
  });
});

describe('Selection — Интеграционные сценарии', () => {
  test('полный сценарий: создание заметки → появление в списке', async () => {
    const notes = [];
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'CREATE_NOTE') {
        notes.push({ id: 'new_1', title: message.title, key: 'note_new_1' });
        callback({ success: true, noteId: 'new_1' });
      } else if (message.type === 'GET_NOTES_SUMMARY') {
        callback(notes);
      } else callback({ success: true });
    });
    
    const { createNewNote, loadNotesList } = require('../../selection.js');
    const newNoteTitleInput = document.getElementById('newNoteTitle');
    
    newNoteTitleInput.value = 'Интеграционная заметка';
    await createNewNote();
    await loadNotesList();
    
    const notesSelect = document.getElementById('notesSelect');
    expect(notesSelect.querySelector('option[value="new_1"]')).not.toBeNull();
  });

  test('полный сценарий: удаление заметки → обновление списка', async () => {
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'GET_NOTES_SUMMARY') callback([]);
      else callback({ success: true });
    });
    
    const { loadNotesList } = require('../../selection.js');
    await loadNotesList();
    
    const notesSelect = document.getElementById('notesSelect');
    expect(notesSelect.innerHTML).toContain('Нет заметок');
  });
});
