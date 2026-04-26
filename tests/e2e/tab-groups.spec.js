/**
 * tab-groups.spec.js — E2E тест для проверки сбора вкладок из групп
 * 
 * Тестируемые сценарии:
 * 1. Кейс 1: Редактор в группе "А" - при OK собирает из группы "А"
 * 2. Кейс 2: Редактор в группе "Б" - при OK собирает из группы "Б"
 * 3. Кейс 3: Редактор НЕ в группе - собирает только негрупппированные вкладки
 * 
 * Запуск: npx playwright test tests/e2e/tab-groups.spec.js
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const EXTENSION_PATH = path.join(__dirname, '../..');

/**
 * Создаёт мок контекст с настроенными вкладками
 */
async function createMockedContext(browser, mockTabs, editorGroupId) {
  const testContext = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  
  await testContext.addInitScript(() => {
    window.chrome = window.chrome || {};
    
    // Мок chrome.tabs.query
    window.chrome.tabs = {
      query: async (queryInfo) => {
        console.log('[E2E Mock] chrome.tabs.query:', queryInfo);
        
        // Список мок-вкладок (будет заполнен из параметра)
        return window.__MOCK_TABS__ || [];
      }
    };
    
    // Мок chrome.tabGroups
    window.chrome.tabGroups = {
      get: async (groupId) => {
        console.log('[E2E Mock] chrome.tabGroups.get:', groupId);
        if (groupId === 42) return { id: 42, title: 'Группа А' };
        if (groupId === 43) return { id: 43, title: 'Группа Б' };
        throw new Error('Group not found');
      }
    };
    
    // Мок chrome.runtime
    window.chrome.runtime = {
      getURL: (file) => new URL(file, window.location.href).href,
      sendMessage: (request, callback) => {
        let response = null;
        const handlers = {
          GET_NOTES_SUMMARY: () => [],
          GET_NOTE: () => ({ content: '', title: '', timestamp: Date.now() }),
          SAVE_NOTE: () => ({ success: true }),
          CLOSE_TAB: () => ({ success: true }),
          OPEN_SELECTION: () => ({ success: true }),
        };
        if (handlers[request.type]) response = handlers[request.type]();
        if (typeof callback === 'function') callback(response);
      },
      lastError: null,
    };
    
    window.chrome.storage = {
      local: {
        get: async () => ({}),
        set: async () => {},
        remove: async () => {},
      },
    };
    
    window.chrome.action = { onClicked: { addListener: () => {} } };
  });
  
  return testContext;
}

test.describe('Сбор вкладок из группы — E2E тест', () => {
  
  test('Кейс 1: редактор в группе "А" - должен собирать только из группы "А"', async ({ browser }) => {
    // Мок-вкладки: редактор в группе 42 (Группа А)
    const mockTabs = [
      { id: 100, url: 'file:///.../editor.html?noteId=1', title: 'Editor', groupId: 42 },
      { id: 101, url: 'https://google.com', title: 'Google', groupId: 42 },  // в группе А
      { id: 102, url: 'https://github.com', title: 'GitHub', groupId: 43 },  // в группе Б
      { id: 103, url: 'https://example.com', title: 'Example', groupId: -1 }, // не в группе
    ];
    
    const testContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    
    await testContext.addInitScript(() => {
      window.__MOCK_TABS__ = arguments[0];
      window.chrome = {
        tabs: {
          query: async (queryInfo) => {
            if (queryInfo.groupId !== undefined) {
              return window.__MOCK_TABS__.filter(t => t.groupId === queryInfo.groupId);
            }
            if (queryInfo.currentWindow) {
              return window.__MOCK_TABS__;
            }
            return [];
          }
        },
        tabGroups: {
          get: async (groupId) => {
            if (groupId === 42) return { id: 42, title: 'Группа А' };
            throw new Error('Group not found');
          }
        },
        runtime: {
          getURL: (file) => new URL(file, window.location.href).href,
          sendMessage: (request, callback) => {
            const handlers = {
              GET_NOTES_SUMMARY: () => [],
              GET_NOTE: () => ({ content: '', title: '', timestamp: Date.now() }),
              SAVE_NOTE: () => ({ success: true }),
              CLOSE_TAB: () => ({ success: true }),
              OPEN_SELECTION: () => ({ success: true }),
            };
            if (handlers[request.type] && typeof callback === 'function') callback(handlers[request.type]());
          },
          lastError: null,
        },
        storage: { local: { get: async () => ({}), set: async () => {} } },
        action: { onClicked: { addListener: () => {} } },
      };
    }, mockTabs);
    
    const testPage = await testContext.newPage();
    const testEditorUrl = pathToFileURL(path.join(EXTENSION_PATH, 'editor.html')).href + '?noteId=test_group_a_' + Date.now();
    
    await testPage.goto(testEditorUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await testPage.waitForSelector('#textEditor', { timeout: 15000 });
    
    // Очищаем редактор
    await testPage.locator('#textEditor').click();
    await testPage.keyboard.press('ControlOrMeta+A');
    await testPage.keyboard.press('Backspace');
    
    // Подписываемся на диалог - нажимаем OK (собираем из группы)
    testPage.on('dialog', async dialog => {
      console.log('Диалог:', dialog.message());
      expect(dialog.message()).toContain('Группа А');
      await dialog.accept(); // OK = собираем из группы
    });
    
    // Нажимаем кнопку сбора вкладок
    await testPage.locator('#collectTabsBtn').click();
    await testPage.waitForTimeout(1500);
    
    // Проверяем результат
    const html = await testPage.locator('#textEditor').evaluate(el => el.innerHTML);
    console.log('HTML после сбора (группа А):', html);
    
    // Должна быть ссылка на Google (из группы А)
    expect(html).toContain('google.com');
    expect(html).toContain('Google');
    
    // НЕ должно быть GitHub (из группы Б) и Example (не в группе)
    expect(html).not.toContain('github.com');
    expect(html).not.toContain('Example');
    
    console.log('✅ Кейс 1 прошёл: собраны вкладки только из группы А');
    
    await testContext.close();
  });

  test('Кейс 2: редактор в группе "Б" - должен собирать только из группы "Б"', async ({ browser }) => {
    // Мок-вкладки: редактор в группе 43 (Группа Б)
    const mockTabs = [
      { id: 100, url: 'file:///.../editor.html?noteId=2', title: 'Editor', groupId: 43 },
      { id: 101, url: 'https://google.com', title: 'Google', groupId: 42 },  // в группе А
      { id: 102, url: 'https://github.com', title: 'GitHub', groupId: 43 },  // в группе Б
      { id: 103, url: 'https://example.com', title: 'Example', groupId: -1 }, // не в группе
    ];
    
    const testContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    
    await testContext.addInitScript(() => {
      window.__MOCK_TABS__ = arguments[0];
      window.chrome = {
        tabs: {
          query: async (queryInfo) => {
            if (queryInfo.groupId !== undefined) {
              return window.__MOCK_TABS__.filter(t => t.groupId === queryInfo.groupId);
            }
            if (queryInfo.currentWindow) {
              return window.__MOCK_TABS__;
            }
            return [];
          }
        },
        tabGroups: {
          get: async (groupId) => {
            if (groupId === 43) return { id: 43, title: 'Группа Б' };
            throw new Error('Group not found');
          }
        },
        runtime: {
          getURL: (file) => new URL(file, window.location.href).href,
          sendMessage: (request, callback) => {
            const handlers = {
              GET_NOTES_SUMMARY: () => [],
              GET_NOTE: () => ({ content: '', title: '', timestamp: Date.now() }),
              SAVE_NOTE: () => ({ success: true }),
              CLOSE_TAB: () => ({ success: true }),
              OPEN_SELECTION: () => ({ success: true }),
            };
            if (handlers[request.type] && typeof callback === 'function') callback(handlers[request.type]());
          },
          lastError: null,
        },
        storage: { local: { get: async () => ({}), set: async () => {} } },
        action: { onClicked: { addListener: () => {} } },
      };
    }, mockTabs);
    
    const testPage = await testContext.newPage();
    const testEditorUrl = pathToFileURL(path.join(EXTENSION_PATH, 'editor.html')).href + '?noteId=test_group_b_' + Date.now();
    
    await testPage.goto(testEditorUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await testPage.waitForSelector('#textEditor', { timeout: 15000 });
    
    // Очищаем редактор
    await testPage.locator('#textEditor').click();
    await testPage.keyboard.press('ControlOrMeta+A');
    await testPage.keyboard.press('Backspace');
    
    // Подписываемся на диалог - нажимаем OK (собираем из группы)
    testPage.on('dialog', async dialog => {
      console.log('Диалог:', dialog.message());
      expect(dialog.message()).toContain('Группа Б');
      await dialog.accept(); // OK = собираем из группы
    });
    
    // Нажимаем кнопку сбора вкладок
    await testPage.locator('#collectTabsBtn').click();
    await testPage.waitForTimeout(1500);
    
    // Проверяем результат
    const html = await testPage.locator('#textEditor').evaluate(el => el.innerHTML);
    console.log('HTML после сбора (группа Б):', html);
    
    // Должна быть ссылка на GitHub (из группы Б)
    expect(html).toContain('github.com');
    expect(html).toContain('GitHub');
    
    // НЕ должно быть Google (из группы А) и Example (не в группе)
    expect(html).not.toContain('google.com');
    expect(html).not.toContain('Example');
    
    console.log('✅ Кейс 2 прошёл: собраны вкладки только из группы Б');
    
    await testContext.close();
  });

  test('Кейс 3: редактор НЕ в группе - должен собирать только негрупппированные вкладки', async ({ browser }) => {
    // Мок-вкладки: редактор НЕ в группе (groupId === -1)
    const mockTabs = [
      { id: 100, url: 'file:///.../editor.html?noteId=3', title: 'Editor', groupId: -1 },
      { id: 101, url: 'https://google.com', title: 'Google', groupId: 42 },   // в группе А
      { id: 102, url: 'https://github.com', title: 'GitHub', groupId: 43 },   // в группе Б
      { id: 103, url: 'https://example.com', title: 'Example', groupId: -1 }, // не в группе
      { id: 104, url: 'https://test.com', title: 'Test', groupId: -1 },       // не в группе
    ];
    
    const testContext = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    
    await testContext.addInitScript(() => {
      window.__MOCK_TABS__ = arguments[0];
      window.chrome = {
        tabs: {
          query: async (queryInfo) => {
            if (queryInfo.groupId !== undefined) {
              return window.__MOCK_TABS__.filter(t => t.groupId === queryInfo.groupId);
            }
            if (queryInfo.currentWindow) {
              return window.__MOCK_TABS__;
            }
            return [];
          }
        },
        tabGroups: {
          get: async () => { throw new Error('Group not found'); }
        },
        runtime: {
          getURL: (file) => new URL(file, window.location.href).href,
          sendMessage: (request, callback) => {
            const handlers = {
              GET_NOTES_SUMMARY: () => [],
              GET_NOTE: () => ({ content: '', title: '', timestamp: Date.now() }),
              SAVE_NOTE: () => ({ success: true }),
              CLOSE_TAB: () => ({ success: true }),
              OPEN_SELECTION: () => ({ success: true }),
            };
            if (handlers[request.type] && typeof callback === 'function') callback(handlers[request.type]());
          },
          lastError: null,
        },
        storage: { local: { get: async () => ({}), set: async () => {} } },
        action: { onClicked: { addListener: () => {} } },
      };
    }, mockTabs);
    
    const testPage = await testContext.newPage();
    const testEditorUrl = pathToFileURL(path.join(EXTENSION_PATH, 'editor.html')).href + '?noteId=test_no_group_' + Date.now();
    
    await testPage.goto(testEditorUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await testPage.waitForSelector('#textEditor', { timeout: 15000 });
    
    // Очищаем редактор
    await testPage.locator('#textEditor').click();
    await testPage.keyboard.press('ControlOrMeta+A');
    await testPage.keyboard.press('Backspace');
    
    // НЕ показываем диалог (редактор не в группе - собираем автоматически)
    
    // Нажимаем кнопку сбора вкладок
    await testPage.locator('#collectTabsBtn').click();
    await testPage.waitForTimeout(1500);
    
    // Проверяем результат
    const html = await testPage.locator('#textEditor').evaluate(el => el.innerHTML);
    console.log('HTML после сбора (без группы):', html);
    
    // Должны быть только Example и Test (не в группе)
    expect(html).toContain('example.com');
    expect(html).toContain('Example');
    expect(html).toContain('test.com');
    expect(html).toContain('Test');
    
    // НЕ должно быть Google (в группе А) и GitHub (в группе Б)
    expect(html).not.toContain('google.com');
    expect(html).not.toContain('GitHub');
    
    console.log('✅ Кейс 3 прошёл: собраны только негрупппированные вкладки');
    
    await testContext.close();
  });
});
