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

describe('Editor — formatTabsAsHtml', () => {
  
  test('форматирует массив вкладок в HTML', () => {
    const { formatTabsAsHtml } = require('../../editor.js');
    
    const tabs = [
      { url: 'https://google.com', title: 'Google', favIconUrl: '' },
      { url: 'https://github.com', title: 'GitHub', favIconUrl: '' },
    ];
    
    const result = formatTabsAsHtml(tabs);
    
    expect(result).toContain('<h2>🔗 Вкладки</h2>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>');
    expect(result).toContain('<a href="https://google.com"');
    expect(result).toContain('>Google</a>');
    expect(result).toContain('<a href="https://github.com"');
    expect(result).toContain('>GitHub</a>');
  });

  test('возвращает пустую строку для пустого массива', () => {
    const { formatTabsAsHtml } = require('../../editor.js');
    
    const result = formatTabsAsHtml([]);
    expect(result).toBe('');
  });

  test('возвращает пустую строку для null/undefined', () => {
    const { formatTabsAsHtml } = require('../../editor.js');
    
    expect(formatTabsAsHtml(null)).toBe('');
    expect(formatTabsAsHtml(undefined)).toBe('');
  });

  test('использует "Без названия" для вкладок без title', () => {
    const { formatTabsAsHtml } = require('../../editor.js');
    
    const tabs = [
      { url: 'https://test.com', title: '', favIconUrl: '' },
    ];
    
    const result = formatTabsAsHtml(tabs);
    
    expect(result).toContain('>Без названия</a>');
  });

  test('экранирует HTML в title', () => {
    const { formatTabsAsHtml } = require('../../editor.js');
    
    const tabs = [
      { url: 'https://test.com', title: '<script>alert("xss")</script>', favIconUrl: '' },
    ];
    
    const result = formatTabsAsHtml(tabs);
    
    // Проверяем что теги экранированы: < = <, > = >, " = "
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('&quot;xss&quot;');
    expect(result).not.toContain('<script>alert'); // Неэкранированный тег не должен присутствовать
  });

  test('экранирует HTML в url', () => {
    const { formatTabsAsHtml } = require('../../editor.js');
    
    const tabs = [
      { url: 'https://test.com?param=<value>', title: 'Test', favIconUrl: '' },
    ];
    
    const result = formatTabsAsHtml(tabs);
    
    // Проверяем что теги экранированы в URL: < = <, > = >
    expect(result).toContain('&lt;value&gt;');
    expect(result).not.toContain('<value>');
  });

  test('добавляет target="_blank" для ссылок', () => {
    const { formatTabsAsHtml } = require('../../editor.js');
    
    const tabs = [
      { url: 'https://test.com', title: 'Test', favIconUrl: '' },
    ];
    
    const result = formatTabsAsHtml(tabs);
    
    expect(result).toContain('target="_blank"');
    expect(result).toContain('rel="noopener noreferrer"');
  });

  test('добавляет эмодзи 🔗 к каждой ссылке', () => {
    const { formatTabsAsHtml } = require('../../editor.js');
    
    const tabs = [
      { url: 'https://test.com', title: 'Test', favIconUrl: '' },
    ];
    
    const result = formatTabsAsHtml(tabs);
    
    expect(result).toContain('🔗</li>');
  });
});

// ============================================
// ТЕСТЫ: Сбор вкладок из группы
// ============================================

describe('Editor — Сбор вкладок из группы', () => {
  
  beforeEach(() => {
    // Дополнительные элементы для тестов
    document.body.innerHTML += `<button id="collectTabsBtn" title="Собрать вкладки">📋</button>`;
  });

  test('sendToBackground отправляет GET_TAB_GROUP_INFO', async () => {
    const mockGroupInfo = {
      success: true,
      inGroup: false,
      hasOtherTabs: true,
      totalTabs: 5
    };
    
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'GET_TAB_GROUP_INFO') {
        callback(mockGroupInfo);
      } else {
        callback({ success: true });
      }
    });
    
    const { sendToBackground } = require('../../editor.js');
    
    const result = await sendToBackground('GET_TAB_GROUP_INFO');
    
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'GET_TAB_GROUP_INFO' },
      expect.any(Function)
    );
    expect(result.inGroup).toBe(false);
  });

  test('sendToBackground отправляет COLLECT_TABS_FROM_GROUP', async () => {
    const mockTabs = {
      success: true,
      tabs: [
        { url: 'https://example.com', title: 'Example', favIconUrl: '' }
      ],
      fromGroup: true
    };
    
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      if (message.type === 'COLLECT_TABS_FROM_GROUP') {
        callback(mockTabs);
      } else {
        callback({ success: true });
      }
    });
    
    const { sendToBackground } = require('../../editor.js');
    
    const result = await sendToBackground('COLLECT_TABS_FROM_GROUP');
    
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      { type: 'COLLECT_TABS_FROM_GROUP' },
      expect.any(Function)
    );
    expect(result.fromGroup).toBe(true);
    expect(result.tabs).toHaveLength(1);
  });

  test('sendToBackground обрабатывает ошибку при недоступности background', async () => {
    // Мок, который возвращает пустой объект (как при ошибке message port closed)
    chrome.runtime.sendMessage.mockImplementation((message, callback) => {
      callback({});
    });
    
    const { sendToBackground } = require('../../editor.js');
    
    const result = await sendToBackground('GET_TAB_GROUP_INFO');
    
    // Должен вернуть пустой объект при ошибке
    expect(Object.keys(result)).toHaveLength(0);
  });
});

describe('Editor — formatTabsAsHtml с флагом fromGroup', () => {
  
  test('форматирует вкладки с флагом fromGroup', () => {
    const { formatTabsAsHtml } = require('../../editor.js');
    
    const tabs = [
      { url: 'https://group-site1.com', title: 'Group Site 1', favIconUrl: '' },
      { url: 'https://group-site2.com', title: 'Group Site 2', favIconUrl: '' },
    ];
    
    const result = formatTabsAsHtml(tabs);
    
    // Проверяем базовую структуру
    expect(result).toContain('<h2>🔗 Вкладки</h2>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>');
    expect(result).toContain('group-site1.com');
    expect(result).toContain('group-site2.com');
  });
});
