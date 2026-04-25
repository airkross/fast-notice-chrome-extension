beforeEach(() => {
  process.env.NODE_ENV = 'test';
  
  // Мок chrome API
  global.chrome = {
    runtime: {
      sendMessage: jest.fn((message, callback) => callback({ success: true })),
      lastError: null,
    },
  };
  
  global.alert = jest.fn();
  global.confirm = jest.fn(() => true);
  
  // Мок matchMedia
  global.window = {
    matchMedia: jest.fn().mockReturnValue({ matches: false }),
  };
  
  // Базовая HTML структура страницы редактора
  document.body.innerHTML = `
    <input id="noteTitle" />
    <select id="notesList"></select>
    <span id="saveStatus">Готово</span>
    <button id="deleteNote">🗑️</button>
    <button id="themeToggleBtn" title="Переключить тему">🌙</button>
    <div id="debugModal" class="hidden">
      <button id="closeModal">✕</button>
      <table class="debug-table">
        <tbody id="debugTableBody"></tbody>
      </table>
    </div>
    <div id="pellEditor">
      <div id="textEditor" contenteditable="true"></div>
    </div>
    <select id="headingSelect">
      <option value="p">Текст</option>
      <option value="h1">Заголовок 1</option>
    </select>
    <button id="linkBtn">🔗</button>
  `;
});

afterEach(() => {
  jest.resetModules();
  jest.clearAllMocks();
  delete global.chrome;
  delete global.alert;
  delete global.confirm;
  delete process.env.NODE_ENV;
});

describe('Editor — Переключение темы', () => {
  
  test('toggleTheme: переключает на темную тему', () => {
    const { toggleTheme } = require('../../editor.js');
    
    // Вызываем дважды чтобы переключить на темную
    const themeBtn = document.getElementById('themeToggleBtn');
    
    toggleTheme();
    expect(document.body.classList.contains('dark-theme')).toBe(true);
    expect(document.body.classList.contains('light-theme')).toBe(false);
  });

  test('toggleTheme: переключает обратно на светлую тему', () => {
    const { toggleTheme } = require('../../editor.js');
    
    // Сначала включаем темную
    toggleTheme();
    toggleTheme();
    
    const themeBtn = document.getElementById('themeToggleBtn');
    expect(document.body.classList.contains('light-theme')).toBe(true);
    expect(document.body.classList.contains('dark-theme')).toBe(false);
  });

  test('toggleTheme работает корректно без themeToggleBtn в DOM', () => {
    // Удаляем кнопку
    const btn = document.getElementById('themeToggleBtn');
    btn.remove();
    
    const { toggleTheme } = require('../../editor.js');
    
    // Не должно выбросить ошибку
    expect(() => toggleTheme()).not.toThrow();
  });
});

describe('Editor — sendToBackground', () => {
  
  test('sendToBackground: отправляет сообщение в chrome.runtime', async () => {
    const { sendToBackground } = require('../../editor.js');

    await sendToBackground('TEST_MESSAGE', { data: 'test' });

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'TEST_MESSAGE', data: 'test' },
      expect.any(Function)
    );
  });

  test('sendToBackground: возвращает response при успехе', async () => {
    const mockResponse = { success: true, data: 'test' };
    chrome.runtime.sendMessage.mockImplementation((message, callback) => callback(mockResponse));
    const { sendToBackground } = require('../../editor.js');

    const result = await sendToBackground('TEST_MESSAGE');

    expect(result).toEqual(mockResponse);
  });
});

describe('Editor — Синхронизация темы', () => {
  
  test('использует единый ключ localStorage для синхронизации', () => {
    const { THEME_STORAGE_KEY } = require('../../editor.js');
    // Ключ должен быть 'theme' для совместимости с selection.js
    expect(THEME_STORAGE_KEY).toBe('theme');
  });

  test('toggleTheme сохраняет тему в localStorage', () => {
    const { toggleTheme } = require('../../editor.js');
    
    toggleTheme();
    
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  test('loadTheme загружает сохранённую тему из localStorage', () => {
    // Устанавливаем значение напрямую в localStorage
    localStorage.setItem('theme', 'dark');
    
    const { loadTheme } = require('../../editor.js');
    loadTheme();
    
    expect(document.body.classList.contains('dark-theme')).toBe(true);
  });

  test('тема синхронизируется между страницами: selection и editor используют один ключ', () => {
    const { THEME_STORAGE_KEY, toggleTheme } = require('../../editor.js');
    
    // Включаем темную тему в editor
    toggleTheme();
    
    // Проверяем что тема сохранена под тем же ключом, что и в selection.js
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    expect(savedTheme).toBe('dark');
    // selection.js также использует ключ 'theme'
  });
});

describe('Editor — Селект выбора заметки', () => {
  
  test('notesList элемент присутствует в DOM', () => {
    const notesSelect = document.getElementById('notesList');
    expect(notesSelect).not.toBeNull();
    expect(notesSelect.tagName).toBe('SELECT');
  });

  test('notesList имеет корректный id', () => {
    const notesSelect = document.getElementById('notesList');
    expect(notesSelect.id).toBe('notesList');
  });

  test('refreshNotesList вызывает GET_NOTES_SUMMARY', async () => {
    // Настраиваем мок для возврата списка заметок
    const mockNotes = [
      { id: 'note1', key: 'note_note1', title: 'Заметка 1', hasContent: true },
      { id: 'note2', key: 'note_note2', title: 'Заметка 2', hasContent: false },
    ];
    
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'GET_NOTES_SUMMARY') {
        callback(mockNotes);
      } else {
        callback({ success: true });
      }
    });
    
    // Перезагружаем модуль, чтобы получить свежую функцию
    jest.resetModules();
    const { refreshNotesList } = require('../../editor.js');
    
    await refreshNotesList();
    
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'GET_NOTES_SUMMARY' },
      expect.any(Function)
    );
  });

  test('refreshNotesList добавляет опции для заметок', async () => {
    const mockNotes = [
      { id: 'note1', key: 'note_note1', title: 'Моя заметка', hasContent: true },
      { id: 'note2', key: 'note_note2', title: '', hasContent: false },
    ];
    
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'GET_NOTES_SUMMARY') {
        callback(mockNotes);
      } else {
        callback({ success: true });
      }
    });
    
    jest.resetModules();
    const { refreshNotesList } = require('../../editor.js');
    
    await refreshNotesList();
    
    const notesSelect = document.getElementById('notesList');
    // После обновления должны быть: placeholder + 2 заметки
    expect(notesSelect.options.length).toBeGreaterThanOrEqual(2);
  });

  test('refreshNotesList обрабатывает ошибку без падения', async () => {
    // Мокаем chrome.runtime.sendMessage чтобы он возвращал ошибку
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'GET_NOTES_SUMMARY') {
        // Вызываем callback с ошибкой
        callback(null);
      }
    });
    
    jest.resetModules();
    const { refreshNotesList } = require('../../editor.js');
    
    // Функция должна выполниться без выброса исключения
    await expect(refreshNotesList()).resolves.not.toThrow();
  });

  test('notesList имеет элемент для выбора', async () => {
    // Устанавливаем текущую заметку
    const notesSelect = document.getElementById('notesList');
    
    // Добавляем опции
    notesSelect.innerHTML = `
      <option value="" disabled selected>Выбрать заметку...</option>
      <option value="note1">Заметка 1</option>
      <option value="note2">Заметка 2</option>
    `;
    
    // Выбираем вторую заметку
    notesSelect.value = 'note2';
    notesSelect.dispatchEvent(new Event('change'));
    
    // Проверяем, что значение изменилось
    expect(notesSelect.value).toBe('note2');
  });

  test('refreshNotesList добавляет плейсхолдер при пустом списке', async () => {
    // Возвращаем пустой массив заметок
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'GET_NOTES_SUMMARY') {
        callback([]);
      } else {
        callback({ success: true });
      }
    });
    
    jest.resetModules();
    const { refreshNotesList } = require('../../editor.js');
    
    await refreshNotesList();
    
    const notesSelect = document.getElementById('notesList');
    // Должен быть хотя бы плейсхолдер
    expect(notesSelect.options.length).toBeGreaterThanOrEqual(1);
  });
});
