/**
 * tab-groups.test.js — Unit тесты для проверки сбора вкладок из групп
 * 
 * Тестируемые сценарии:
 * 1. Редактор в группе "А" - должен собирать из группы "А"
 * 2. Редактор в группе "Б" - должен собирать из группы "Б"  
 * 3. Редактор не в группе - должен собирать только негрупппированные вкладки
 */

let editorModule;

// Мок chrome API - аналогично background.test.js
const createChromeMock = () => ({
  tabs: {
    query: jest.fn(),
  },
  tabGroups: {
    get: jest.fn(),
  },
  runtime: {
    sendMessage: jest.fn(),
  },
});

beforeEach(() => {
  global.chrome = createChromeMock();
  jest.resetModules();
});

afterEach(() => {
  jest.clearAllMocks();
  delete global.chrome;
});

describe('checkTabGroup()', () => {
  it('Кейс 1: редактор в группе "А" - должен определить группу "А"', async () => {
    // Мок: редактор в группе 42 (Группа А), плюс еще одна вкладка в той же группе
    const mockTabs = [
      { id: 100, url: 'file:///.../editor.html?noteId=1', title: 'Editor', groupId: 42 },
      { id: 101, url: 'https://google.com', title: 'Google', groupId: 42 }, // в группе А
      { id: 102, url: 'https://github.com', title: 'GitHub', groupId: 43 }, // в группе Б
      { id: 103, url: 'https://example.com', title: 'Example', groupId: -1 }, // не в группе
    ];

    // Первый вызов - получение всех вкладок
    // Второй вызов - получение вкладок группы (должен фильтровать!)
    chrome.tabs.query.mockImplementation(async (query) => {
      if (query.groupId !== undefined) {
        return mockTabs.filter(t => t.groupId === query.groupId);
      }
      return mockTabs;
    });
    chrome.tabGroups.get.mockResolvedValue({ id: 42, title: 'Группа А' });

    editorModule = require('../../editor.js');
    const result = await editorModule.checkTabGroup();

    expect(result.success).toBe(true);
    expect(result.inGroup).toBe(true);
    expect(result.groupId).toBe(42);
    expect(result.groupTitle).toBe('Группа А');
    expect(result.otherGroupTabsCount).toBe(1); // только Google
    expect(result.totalTabs).toBe(4);
  });

  it('Кейс 2: редактор в группе "Б" - должен определить группу "Б"', async () => {
    const mockTabs = [
      { id: 100, url: 'file:///.../editor.html?noteId=2', title: 'Editor', groupId: 43 },
      { id: 101, url: 'https://google.com', title: 'Google', groupId: 42 }, // в группе А
      { id: 102, url: 'https://github.com', title: 'GitHub', groupId: 43 }, // в группе Б
      { id: 103, url: 'https://example.com', title: 'Example', groupId: -1 }, // не в группе
    ];

    // Первый вызов - получение всех вкладок
    // Второй вызов - получение вкладок группы (должен фильтровать!)
    chrome.tabs.query.mockImplementation(async (query) => {
      if (query.groupId !== undefined) {
        return mockTabs.filter(t => t.groupId === query.groupId);
      }
      return mockTabs;
    });
    chrome.tabGroups.get.mockResolvedValue({ id: 43, title: 'Группа Б' });

    editorModule = require('../../editor.js');
    const result = await editorModule.checkTabGroup();

    expect(result.success).toBe(true);
    expect(result.inGroup).toBe(true);
    expect(result.groupId).toBe(43);
    expect(result.groupTitle).toBe('Группа Б');
    expect(result.otherGroupTabsCount).toBe(1); // только GitHub
  });

  it('Кейс 3: chrome.tabGroups недоступен - должен использовать "Безымянная группа"', async () => {
    // Мок без chrome.tabGroups
    global.chrome = {
      tabs: {
        query: jest.fn().mockResolvedValue([
          { id: 100, url: 'file:///.../editor.html?noteId=1', title: 'Editor', groupId: 42 },
          { id: 101, url: 'https://google.com', title: 'Google', groupId: 42 },
        ]),
      },
      runtime: {
        sendMessage: jest.fn(),
      },
    };
    // chrome.tabGroups = undefined (недоступен)

    jest.resetModules();
    editorModule = require('../../editor.js');
    const result = await editorModule.checkTabGroup();

    expect(result.success).toBe(true);
    expect(result.inGroup).toBe(true);
    expect(result.groupId).toBe(42);
    expect(result.groupTitle).toBe('Безымянная группа');
    expect(result.otherGroupTabsCount).toBe(1);
  });

  it('Кейс 4: chrome.tabGroups.get возвращает ошибку - должен использовать "Безымянная группа"', async () => {
    const mockTabs = [
      { id: 100, url: 'file:///.../editor.html?noteId=1', title: 'Editor', groupId: 42 },
      { id: 101, url: 'https://google.com', title: 'Google', groupId: 42 },
    ];

    global.chrome = {
      tabs: {
        query: jest.fn().mockImplementation(async (query) => {
          if (query.groupId !== undefined) {
            return mockTabs.filter(t => t.groupId === query.groupId);
          }
          return mockTabs;
        }),
      },
      tabGroups: {
        get: jest.fn().mockRejectedValue(new Error('Tab group not found')),
      },
      runtime: {
        sendMessage: jest.fn(),
      },
    };

    jest.resetModules();
    editorModule = require('../../editor.js');
    const result = await editorModule.checkTabGroup();

    expect(result.success).toBe(true);
    expect(result.inGroup).toBe(true);
    expect(result.groupId).toBe(42);
    expect(result.groupTitle).toBe('Безымянная группа');
    expect(result.otherGroupTabsCount).toBe(1);
  });

  it('Кейс 5: редактор НЕ в группе - должен определить отсутствие группы', async () => {
    const mockTabs = [
      { id: 100, url: 'file:///.../editor.html?noteId=3', title: 'Editor', groupId: -1 },
      { id: 101, url: 'https://google.com', title: 'Google', groupId: 42 }, // в группе А
      { id: 102, url: 'https://github.com', title: 'GitHub', groupId: 43 }, // в группе Б
      { id: 103, url: 'https://example.com', title: 'Example', groupId: -1 }, // не в группе
    ];

    chrome.tabs.query.mockResolvedValue(mockTabs);

    editorModule = require('../../editor.js');
    const result = await editorModule.checkTabGroup();

    expect(result.success).toBe(true);
    expect(result.inGroup).toBe(false);
    expect(result.otherGroupTabsCount).toBe(0);
    expect(result.ungroupedTabsCount).toBe(1); // только Example
    expect(result.hasOtherTabs).toBe(true);
  });
});

describe('collectTabs()', () => {
  it('Кейс 1: collectFromGroup=true для группы А - собирает только из группы А', async () => {
    const mockTabs = [
      { id: 100, url: 'file:///.../editor.html?noteId=1', title: 'Editor', groupId: 42 },
      { id: 101, url: 'https://google.com', title: 'Google', groupId: 42 }, // в группе А
      { id: 102, url: 'https://github.com', title: 'GitHub', groupId: 43 }, // в группе Б
      { id: 103, url: 'https://example.com', title: 'Example', groupId: -1 }, // не в группе
    ];

    chrome.tabs.query.mockImplementation(async (query) => {
      if (query.groupId !== undefined) {
        return mockTabs.filter(t => t.groupId === query.groupId);
      }
      return mockTabs;
    });

    editorModule = require('../../editor.js');
    const result = await editorModule.collectTabs(true, 42); // collectFromGroup=true, groupId=42

    expect(result.success).toBe(true);
    expect(result.fromGroup).toBe(true);
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].url).toBe('https://google.com');
    expect(result.tabs[0].title).toBe('Google');
    // GitHub и Example НЕ должны попасть в результат
    expect(result.tabs.find(t => t.url.includes('github'))).toBeUndefined();
    expect(result.tabs.find(t => t.url.includes('example'))).toBeUndefined();
  });

  it('Кейс 2: collectFromGroup=true для группы Б - собирает только из группы Б', async () => {
    const mockTabs = [
      { id: 100, url: 'file:///.../editor.html?noteId=2', title: 'Editor', groupId: 43 },
      { id: 101, url: 'https://google.com', title: 'Google', groupId: 42 }, // в группе А
      { id: 102, url: 'https://github.com', title: 'GitHub', groupId: 43 }, // в группе Б
      { id: 103, url: 'https://example.com', title: 'Example', groupId: -1 }, // не в группе
    ];

    chrome.tabs.query.mockImplementation(async (query) => {
      if (query.groupId !== undefined) {
        return mockTabs.filter(t => t.groupId === query.groupId);
      }
      return mockTabs;
    });

    editorModule = require('../../editor.js');
    const result = await editorModule.collectTabs(true, 43); // collectFromGroup=true, groupId=43

    expect(result.success).toBe(true);
    expect(result.fromGroup).toBe(true);
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].url).toBe('https://github.com');
    expect(result.tabs[0].title).toBe('GitHub');
    // Google и Example НЕ должны попасть в результат
    expect(result.tabs.find(t => t.url.includes('google'))).toBeUndefined();
    expect(result.tabs.find(t => t.url.includes('example'))).toBeUndefined();
  });

  it('Кейс 3: collectFromGroup=false - собирает только негрупппированные вкладки', async () => {
    const mockTabs = [
      { id: 100, url: 'file:///.../editor.html?noteId=3', title: 'Editor', groupId: -1 },
      { id: 101, url: 'https://google.com', title: 'Google', groupId: 42 }, // в группе А
      { id: 102, url: 'https://github.com', title: 'GitHub', groupId: 43 }, // в группе Б
      { id: 103, url: 'https://example.com', title: 'Example', groupId: -1 }, // не в группе
    ];

    chrome.tabs.query.mockImplementation(async (query) => {
      if (query.groupId !== undefined) {
        return mockTabs.filter(t => t.groupId === query.groupId);
      }
      return mockTabs;
    });

    editorModule = require('../../editor.js');
    const result = await editorModule.collectTabs(false); // collectFromGroup=false

    expect(result.success).toBe(true);
    expect(result.fromGroup).toBe(false);
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].url).toBe('https://example.com');
    expect(result.tabs[0].title).toBe('Example');
    // Google и GitHub НЕ должны попасть в результат (они в группах)
    expect(result.tabs.find(t => t.url.includes('google'))).toBeUndefined();
    expect(result.tabs.find(t => t.url.includes('github'))).toBeUndefined();
  });
});

describe('Интеграция: полный сценарий', () => {
  it('должен корректно определять и собирать вкладки для группы А', async () => {
    const mockTabs = [
      { id: 100, url: 'file:///.../editor.html?noteId=1', title: 'Editor', groupId: 42 },
      { id: 101, url: 'https://google.com', title: 'Google', groupId: 42 },
      { id: 102, url: 'https://github.com', title: 'GitHub', groupId: 43 },
      { id: 103, url: 'https://example.com', title: 'Example', groupId: -1 },
    ];

    chrome.tabs.query.mockResolvedValue(mockTabs);
    chrome.tabGroups.get.mockResolvedValue({ id: 42, title: 'Группа А' });

    editorModule = require('../../editor.js');
    
    // Проверяем группу
    const groupInfo = await editorModule.checkTabGroup();
    expect(groupInfo.inGroup).toBe(true);
    expect(groupInfo.groupId).toBe(42);
    
    // Собираем из группы
    chrome.tabs.query.mockImplementation(async (query) => {
      if (query.groupId !== undefined) {
        return mockTabs.filter(t => t.groupId === query.groupId);
      }
      return mockTabs;
    });
    const result = await editorModule.collectTabs(true, groupInfo.groupId);
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].title).toBe('Google');
  });

  it('должен корректно определять и собирать вкладки для группы Б', async () => {
    const mockTabs = [
      { id: 100, url: 'file:///.../editor.html?noteId=2', title: 'Editor', groupId: 43 },
      { id: 101, url: 'https://google.com', title: 'Google', groupId: 42 },
      { id: 102, url: 'https://github.com', title: 'GitHub', groupId: 43 },
      { id: 103, url: 'https://example.com', title: 'Example', groupId: -1 },
    ];

    chrome.tabs.query.mockResolvedValue(mockTabs);
    chrome.tabGroups.get.mockResolvedValue({ id: 43, title: 'Группа Б' });

    editorModule = require('../../editor.js');
    
    const groupInfo = await editorModule.checkTabGroup();
    expect(groupInfo.inGroup).toBe(true);
    expect(groupInfo.groupId).toBe(43);
    
    chrome.tabs.query.mockImplementation(async (query) => {
      if (query.groupId !== undefined) {
        return mockTabs.filter(t => t.groupId === query.groupId);
      }
      return mockTabs;
    });
    const result = await editorModule.collectTabs(true, groupInfo.groupId);
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].title).toBe('GitHub');
  });

  it('должен корректно собирать негрупппированные вкладки когда редактор не в группе', async () => {
    const mockTabs = [
      { id: 100, url: 'file:///.../editor.html?noteId=3', title: 'Editor', groupId: -1 },
      { id: 101, url: 'https://google.com', title: 'Google', groupId: 42 },
      { id: 102, url: 'https://github.com', title: 'GitHub', groupId: 43 },
      { id: 103, url: 'https://example.com', title: 'Example', groupId: -1 },
      { id: 104, url: 'https://test.com', title: 'Test', groupId: -1 },
    ];

    chrome.tabs.query.mockResolvedValue(mockTabs);

    editorModule = require('../../editor.js');
    
    const groupInfo = await editorModule.checkTabGroup();
    expect(groupInfo.inGroup).toBe(false);
    expect(groupInfo.ungroupedTabsCount).toBe(2);
    
    const result = await editorModule.collectTabs(false);
    expect(result.tabs).toHaveLength(2);
    expect(result.tabs.map(t => t.title).sort()).toEqual(['Example', 'Test']);
  });
});
