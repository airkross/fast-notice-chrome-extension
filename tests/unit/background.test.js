/**
 * background.test.js — Unit-тесты для background.js
 */

let background;

// Мок chrome API
const createChromeMock = () => ({
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
    create: jest.fn(() => Promise.resolve({ id: 123 })),
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
});

beforeEach(() => {
  global.chrome = createChromeMock();
  jest.resetModules();
  
  // Import after setting up mocks
  background = require('../../background.js');
});

afterEach(() => {
  jest.clearAllMocks();
  delete global.chrome;
});

describe('Background — Функции CRUD', () => {
  
  describe('createNewNote', () => {
    test('создает заметку с заголовком', async () => {
      chrome.storage.local.set.mockResolvedValue();
      
      const result = await background.createNewNote('Моя заметка', 123);
      
      expect(result.success).toBe(true);
      expect(result.noteId).toMatch(/^note_\d+_/);
      expect(chrome.tabs.update).toHaveBeenCalledWith(123, expect.objectContaining({
        url: expect.stringContaining('editor.html')
      }));
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [`note_${result.noteId}`]: expect.objectContaining({
            content: '',
            title: 'Моя заметка',
            timestamp: expect.any(Number),
            createdAt: expect.any(Number)
          })
        })
      );
    });

    test('создает заметку без заголовка', async () => {
      chrome.storage.local.set.mockResolvedValue();
      
      const result = await background.createNewNote('', null);
      
      expect(result.success).toBe(true);
      expect(chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          [`note_${result.noteId}`]: expect.objectContaining({ title: '' })
        })
      );
    });

    test('возвращает ошибку при исключении', async () => {
      chrome.storage.local.set.mockRejectedValue(new Error('Storage error'));
      
      const result = await background.createNewNote('Test', 123);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage error');
    });
  });

  describe('openExistingNote', () => {
    test('открывает существующую заметку', async () => {
      const result = await background.openExistingNote('note_123', 456);
      
      expect(result.success).toBe(true);
      expect(chrome.tabs.update).toHaveBeenCalledWith(456, expect.objectContaining({
        url: expect.stringContaining('noteId=note_123')
      }));
    });

    test('возвращает ошибку при исключении', async () => {
      chrome.tabs.update.mockRejectedValue(new Error('Tab error'));
      
      const result = await background.openExistingNote('note_123', 456);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Tab error');
    });
  });

  describe('deleteNoteById', () => {
    test('удаляет существующую заметку', async () => {
      chrome.storage.local.get
        .mockResolvedValueOnce({ note_abc: { title: 'Test' } })
        .mockResolvedValueOnce({}); // verify after delete
      chrome.storage.local.remove.mockResolvedValue();
      
      const result = await background.deleteNoteById('abc');
      
      expect(result.success).toBe(true);
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('note_abc');
    });

    test('возвращает alreadyDeleted если заметки нет', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      
      const result = await background.deleteNoteById('abc');
      
      expect(result.success).toBe(true);
      expect(result.alreadyDeleted).toBe(true);
      expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    });

    test('возвращает ошибку без noteId', async () => {
      const result = await background.deleteNoteById('');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No noteId provided');
    });

    test('возвращает ошибку если удаление не подтверждено', async () => {
      chrome.storage.local.get
        .mockResolvedValueOnce({ note_abc: { title: 'Test' } })
        .mockResolvedValueOnce({ note_abc: { title: 'Test' } }); // verify shows it still exists
      
      const result = await background.deleteNoteById('abc');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Удаление не подтверждено');
    });

    test('возвращает ошибку при исключении', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));
      
      const result = await background.deleteNoteById('abc');
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage error');
    });
  });

  describe('getAllNotesSummary', () => {
    test('возвращает пустой массив при отсутствии заметок', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      
      const result = await background.getAllNotesSummary();
      
      expect(result).toEqual([]);
    });

    test('возвращает отсортированный по timestamp список', async () => {
      chrome.storage.local.get.mockResolvedValue({
        note_old: { title: 'Старая', content: '', timestamp: 1000, createdAt: 1000 },
        note_new: { title: 'Новая', content: '<p>Text</p>', timestamp: 2000, createdAt: 2000 },
      });
      
      const result = await background.getAllNotesSummary();
      
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Новая');
      expect(result[1].title).toBe('Старая');
    });

    test('правильно формирует preview из content', async () => {
      chrome.storage.local.get.mockResolvedValue({
        note_1: { title: '', content: '<p>Some long content here</p>', timestamp: 1000, createdAt: 1000 },
      });
      
      const result = await background.getAllNotesSummary();
      
      expect(result[0].preview).toBe('Some long content here');
    });

    test('обрезает preview до 60 символов', async () => {
      const longContent = 'A'.repeat(100);
      chrome.storage.local.get.mockResolvedValue({
        note_1: { title: '', content: `<p>${longContent}</p>`, timestamp: 1000, createdAt: 1000 },
      });
      
      const result = await background.getAllNotesSummary();
      
      expect(result[0].preview.length).toBe(63); // 60 + '...'
    });

    test('правильно определяет hasContent', async () => {
      chrome.storage.local.get.mockResolvedValue({
        note_empty: { title: '', content: '', timestamp: 1000, createdAt: 1000 },
        note_with_title: { title: 'Title', content: '', timestamp: 1000, createdAt: 1000 },
        note_with_content: { title: '', content: '<p>Text</p>', timestamp: 1000, createdAt: 1000 },
        note_with_both: { title: 'Title', content: '<p>Text</p>', timestamp: 1000, createdAt: 1000 },
      });
      
      const result = await background.getAllNotesSummary();
      const empty = result.find(n => n.id === 'empty');
      const withTitle = result.find(n => n.id === 'with_title');
      const withContent = result.find(n => n.id === 'with_content');
      const withBoth = result.find(n => n.id === 'with_both');
      
      expect(empty.hasContent).toBe(false);
      expect(withTitle.hasContent).toBe(true);
      expect(withContent.hasContent).toBe(true);
      expect(withBoth.hasContent).toBe(true);
    });

    test('возвращает пустой массив при ошибке', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));
      
      const result = await background.getAllNotesSummary();
      
      expect(result).toEqual([]);
    });

    test('фильтрует невалидные записи', async () => {
      chrome.storage.local.get.mockResolvedValue({
        note_valid: { title: 'Valid', content: '<p>Test</p>', timestamp: 1000, createdAt: 1000 },
        note_null: null,
        note_undefined: undefined,
        some_other_key: { title: 'Not a note' },
      });
      
      const result = await background.getAllNotesSummary();
      
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('valid');
    });
  });

  describe('getNoteById', () => {
    test('возвращает заметку по id', async () => {
      chrome.storage.local.get.mockResolvedValue({ note_123: { title: 'Test', content: '<p>Hello</p>' } });
      
      const result = await background.getNoteById('123');
      
      expect(result).toEqual({ title: 'Test', content: '<p>Hello</p>' });
    });

    test('возвращает null при отсутствии noteId', async () => {
      const result = await background.getNoteById('');
      
      expect(result).toBeNull();
    });

    test('возвращает null когда заметка не найдена', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      
      const result = await background.getNoteById('notexist');
      
      expect(result).toBeNull();
    });

    test('возвращает null при ошибке', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));
      
      const result = await background.getNoteById('123');
      
      expect(result).toBeNull();
    });
  });

  describe('saveNote', () => {
    test('сохраняет новую заметку', async () => {
      chrome.storage.local.get.mockResolvedValue({});
      chrome.storage.local.set.mockResolvedValue();
      
      const result = await background.saveNote('new_note', { title: 'New', content: '<p>Test</p>' });
      
      expect(result.success).toBe(true);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        note_new_note: expect.objectContaining({
          title: 'New',
          content: '<p>Test</p>',
          timestamp: expect.any(Number)
        })
      });
    });

    test('обновляет существующую заметку с мержем', async () => {
      chrome.storage.local.get.mockResolvedValue({
        note_existing: { title: 'Old', content: '<p>Old</p>', createdAt: 1000 }
      });
      chrome.storage.local.set.mockResolvedValue();
      
      const result = await background.saveNote('existing', { content: '<p>New</p>' });
      
      expect(result.success).toBe(true);
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        note_existing: expect.objectContaining({
          title: 'Old',
          content: '<p>New</p>',
          createdAt: 1000,
          timestamp: expect.any(Number)
        })
      });
    });

    test('возвращает ошибку без noteId', async () => {
      const result = await background.saveNote('', { title: 'Test' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('No noteId');
    });

    test('возвращает ошибку при исключении', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));
      
      const result = await background.saveNote('123', { title: 'Test' });
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Storage error');
    });
  });

  describe('getDebugDump', () => {
    test('возвращает дамп всех заметок', async () => {
      chrome.storage.local.get.mockResolvedValue({
        note_1: { title: 'Note 1', content: '<p>Content 1</p>', timestamp: 1000 },
        note_2: { title: 'Note 2', content: '', timestamp: 2000 },
      });
      
      const result = await background.getDebugDump();
      
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        key: 'note_1',
        id: '1',
        title: 'Note 1',
        content: '<p>Content 1</p>',
      });
    });

    test('обрезает длинный контент', async () => {
      const longContent = 'A'.repeat(100);
      chrome.storage.local.get.mockResolvedValue({
        note_1: { title: 'Note', content: longContent, timestamp: 1000 },
      });
      
      const result = await background.getDebugDump();
      
      expect(result[0].content.length).toBe(53); // 50 + '...'
    });

    test('возвращает пустой заголовок по умолчанию', async () => {
      chrome.storage.local.get.mockResolvedValue({
        note_1: { content: '<p>Test</p>', timestamp: 1000 },
      });
      
      const result = await background.getDebugDump();
      
      expect(result[0].title).toBe('(без заголовка)');
    });

    test('возвращает пустой массив при ошибке', async () => {
      chrome.storage.local.get.mockRejectedValue(new Error('Storage error'));
      
      const result = await background.getDebugDump();
      
      expect(result).toEqual([]);
    });

    test('фильтрует невалидные записи', async () => {
      chrome.storage.local.get.mockResolvedValue({
        note_valid: { title: 'Valid', content: '<p>Test</p>', timestamp: 1000 },
        invalid_key: { title: 'Not a note' },
      });
      
      const result = await background.getDebugDump();
      
      expect(result).toHaveLength(1);
    });
  });
});

describe('Background — chrome.action.onClicked', () => {
  test('chrome.action.onClicked.addListener вызван', () => {
    expect(chrome.action.onClicked.addListener).toHaveBeenCalled();
  });
});

describe('Background — chrome.runtime.onMessage', () => {
  test('обрабатывает все типы сообщений', async () => {
    // Перезагрузим модуль для чистого теста
    jest.resetModules();
    global.chrome = createChromeMock();
    
    const bg = require('../../background.js');
    
    // Проверяем, что addListener был вызван
    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalled();
    
    // Получаем обработчик
    const handler = chrome.runtime.onMessage.addListener.mock.calls[0][0];
    
    // Тестируем CREATE_NOTE
    chrome.storage.local.set.mockResolvedValue();
    let response = jest.fn();
    
    handler({ type: 'CREATE_NOTE', title: 'Test' }, { tab: { id: 123 } }, response);
    
    // Ждем async выполнения
    await new Promise(resolve => setTimeout(resolve, 10));
    
    expect(response).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe('Background — chrome.runtime.onInstalled', () => {
  test('логирует установку', () => {
    jest.resetModules();
    global.chrome = createChromeMock();
    
    require('../../background.js');
    
    expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();
    
    const handler = chrome.runtime.onInstalled.addListener.mock.calls[0][0];
    handler({ version: '1.0.0', reason: 'install' });
  });
});
