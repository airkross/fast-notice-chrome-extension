/**
 * visual.spec.js — Визуальные (скриншот) тесты
 * 
 * Тестирует внешний вид основных страниц:
 * - Editor (страница редактирования заметки)
 * - Selection (страница выбора заметок)
 * 
 * Использует Playwright screenshot testing с baseline comparison
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const EXTENSION_PATH = path.join(__dirname, '../..');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');
const BASELINE_DIR = path.join(SCREENSHOTS_DIR, 'baseline');
const DIFF_DIR = path.join(SCREENSHOTS_DIR, 'diff');

// Mock chrome.runtime для всех тестов
test.describe.configure({ mode: 'parallel' });

// Common mock для всех тестов
async function mockChromeRuntime(context) {
  await context.addInitScript(() => {
    const noteStore = new Map();
    
    // Добавляем тестовые данные
    noteStore.set('test_1', {
      id: 'test_1',
      title: 'Тестовая заметка 1',
      content: '<p>Первая тестовая заметка</p>',
      timestamp: Date.now() - 10000,
      createdAt: Date.now() - 10000,
    });
    
    noteStore.set('test_2', {
      id: 'test_2', 
      title: 'Заметка с длинным заголовком для тестирования',
      content: '<h2>Заголовок</h2><p>Текст заметки с <b>форматированием</b></p>',
      timestamp: Date.now() - 20000,
      createdAt: Date.now() - 20000,
    });

    function makeSummary() {
      return Array.from(noteStore.entries())
        .map(([noteId, value]) => ({
          id: noteId,
          key: `note_${noteId}`,
          title: value.title?.trim() || '',
          preview: (value.content || '')
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 60),
          timestamp: value.timestamp || 0,
          hasContent: !!((value.content || '').trim() || (value.title || '').trim()),
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
    }

    window.chrome = {
      runtime: {
        getURL: (file) => new URL(file, window.location.href).href,
        sendMessage: (request, callback) => {
          let response = null;
          const now = Date.now();
          const noteId = request.noteId;

          const handlers = {
            CREATE_NOTE: () => {
              const newId = `test_${now}_${Math.random().toString(36).slice(2, 8)}`;
              const data = {
                content: '',
                title: request.title || '',
                timestamp: now,
                createdAt: now,
              };
              noteStore.set(newId, data);
              return { success: true, noteId: newId };
            },
            GET_NOTES_SUMMARY: () => makeSummary(),
            GET_NOTE: () => noteStore.get(noteId) || null,
            SAVE_NOTE: () => {
              const existing = noteStore.get(noteId) || {};
              noteStore.set(noteId, {
                ...existing,
                ...request.data,
                timestamp: now,
                createdAt: existing.createdAt || now,
              });
              return { success: true };
            },
            DELETE_NOTE: () => {
              noteStore.delete(noteId);
              return { success: true };
            },
            OPEN_SELECTION: () => ({ success: true }),
            CLOSE_TAB: () => ({ success: true }),
          };

          if (handlers[request.type]) {
            response = handlers[request.type]();
          }

          if (typeof callback === 'function') {
            callback(response);
          }
        },
      },
    };
  });
}

test.describe('📸 Visual Regression Tests', () => {
  let context;
  let page;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    
    await mockChromeRuntime(context);
    page = await context.newPage();
    
    // Убираем лишние логи
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log('Browser error:', msg.text());
      }
    });
  });

  test.afterAll(async () => {
    await context?.close();
  });

  /**
   * 📝 Тест: Editor - пустая страница
   */
  test('Editor - пустая страница редактора', async () => {
    const basePath = path.join(EXTENSION_PATH, 'editor.html');
    const editorUrl = new URL(pathToFileURL(basePath));
    editorUrl.searchParams.set('noteId', 'test_empty');
    
    await page.goto(editorUrl.href, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#textEditor', { timeout: 15000 });
    
    // Ждём инициализации
    await page.waitForTimeout(1000);
    
    // Скриншот
    await expect(page).toHaveScreenshot('editor-empty.png', {
      maxDiffPixelRatio: 0.2,
    });
  });

  /**
   * 📝 Тест: Editor - с контентом
   */
  test('Editor - страница с контентом', async () => {
    const basePath = path.join(EXTENSION_PATH, 'editor.html');
    const editorUrl = new URL(pathToFileURL(basePath));
    editorUrl.searchParams.set('noteId', 'test_1');
    
    await page.goto(editorUrl.href, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#textEditor', { timeout: 15000 });
    
    // Ждём инициализации
    await page.waitForTimeout(1000);
    
    // Скриншот
    await expect(page).toHaveScreenshot('editor-with-content.png', {
      maxDiffPixelRatio: 0.2,
    });
  });

  /**
   * 📝 Тест: Editor - с форматированием (заголовки)
   */
  test('Editor - с заголовками h1-h5', async () => {
    const basePath = path.join(EXTENSION_PATH, 'editor.html');
    const editorUrl = new URL(pathToFileURL(basePath));
    editorUrl.searchParams.set('noteId', 'test_headings');
    
    await page.goto(editorUrl.href, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#textEditor', { timeout: 15000 });
    
    // Добавим контент с заголовками через evaluate
    await page.evaluate(() => {
      const editor = document.getElementById('textEditor');
      editor.innerHTML = `
        <h1>Заголовок H1</h1>
        <h2>Заголовок H2</h2>
        <h3>Заголовок H3</h3>
        <p>Обычный текст после заголовков</p>
        <h4>Заголовок H4</h4>
        <h5>Заголовок H5</h5>
      `;
    });
    
    await page.waitForTimeout(500);
    
    // Скриншот
    await expect(page).toHaveScreenshot('editor-with-headings.png', {
      maxDiffPixelRatio: 0.2,
    });
  });

  /**
   * 📝 Тест: Editor - dark тема
   */
  test('Editor - темная тема', async () => {
    const basePath = path.join(EXTENSION_PATH, 'editor.html');
    const editorUrl = new URL(pathToFileURL(basePath));
    editorUrl.searchParams.set('noteId', 'test_dark');
    
    await page.goto(editorUrl.href, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#textEditor', { timeout: 15000 });
    
    // Включаем темную тему
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    });
    
    await page.waitForTimeout(500);
    
    // Скриншот
    await expect(page).toHaveScreenshot('editor-dark-theme.png', {
      maxDiffPixelRatio: 0.2,
    });
  });

  /**
   * 📋 Тест: Selection - страница выбора заметок
   */
  test('Selection - страница выбора заметок', async () => {
    const basePath = path.join(EXTENSION_PATH, 'selection.html');
    const selectionUrl = pathToFileURL(basePath);
    
    await page.goto(selectionUrl.href, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#dropdownTrigger', { timeout: 15000 });
    
    // Ждём загрузки данных
    await page.waitForTimeout(1000);
    
    // Скриншот
    await expect(page).toHaveScreenshot('selection-page.png', {
      maxDiffPixelRatio: 0.2,
    });
  });

  /**
   * 📋 Тест: Selection - dark тема
   */
  test('Selection - темная тема', async () => {
    const basePath = path.join(EXTENSION_PATH, 'selection.html');
    const selectionUrl = pathToFileURL(basePath);
    
    await page.goto(selectionUrl.href, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#dropdownTrigger', { timeout: 15000 });
    
    // Включаем темную тему
    await page.evaluate(() => {
      localStorage.setItem('theme', 'dark');
      document.body.classList.add('dark-theme');
      document.body.classList.remove('light-theme');
    });
    
    await page.waitForTimeout(500);
    
    // Скриншот
    await expect(page).toHaveScreenshot('selection-dark-theme.png', {
      maxDiffPixelRatio: 0.2,
    });
  });

  /**
   * 📋 Тест: Selection - пустой список
   */
  test('Selection - пустой список заметок', async () => {
    // Создаём новый контекст с пустыми данными
    const newContext = await page.context().browser().newContext({
      viewport: { width: 1280, height: 720 },
    });
    
    await newContext.addInitScript(() => {
      window.chrome = {
        runtime: {
          getURL: (file) => new URL(file, window.location.href).href,
          sendMessage: (request, callback) => {
            let response = null;
            const handlers = {
              GET_NOTES_SUMMARY: () => [],
              GET_NOTE: () => null,
              SAVE_NOTE: () => ({ success: true }),
              DELETE_NOTE: () => ({ success: true }),
              CREATE_NOTE: () => ({ success: true, noteId: 'new' }),
              OPEN_SELECTION: () => ({ success: true }),
              CLOSE_TAB: () => ({ success: true }),
            };
            if (handlers[request.type]) {
              response = handlers[request.type]();
            }
            if (typeof callback === 'function') {
              callback(response);
            }
          },
        },
      };
    });
    
    const newPage = await newContext.newPage();
    
    const basePath = path.join(EXTENSION_PATH, 'selection.html');
    const selectionUrl = pathToFileURL(basePath);
    
    await newPage.goto(selectionUrl.href, { waitUntil: 'networkidle', timeout: 30000 });
    await newPage.waitForTimeout(1000);
    
    // Скриншот пустого списка
    await expect(newPage).toHaveScreenshot('selection-empty.png', {
      maxDiffPixelRatio: 0.2,
    });
    
    await newContext.close();
  });

  /**
   * 🔧 Тест: Editor - heading Select (focus state)
   */
  test('Editor - heading Select в фокусе', async () => {
    const basePath = path.join(EXTENSION_PATH, 'editor.html');
    const editorUrl = new URL(pathToFileURL(basePath));
    editorUrl.searchParams.set('noteId', 'test_select');
    
    await page.goto(editorUrl.href, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#headingSelect', { timeout: 15000 });
    
    // Фокус на heading Select
    await page.focus('#headingSelect');
    await page.waitForTimeout(300);
    
    // Скриншот с Select в фокусе
    await expect(page).toHaveScreenshot('editor-select-focus.png', {
      maxDiffPixelRatio: 0.2,
    });
  });

  /**
   * 🔧 Тест: Editor - notes Select (focus state)
   */
  test('Editor - notes Select в фокусе', async () => {
    const basePath = path.join(EXTENSION_PATH, 'editor.html');
    const editorUrl = new URL(pathToFileURL(basePath));
    editorUrl.searchParams.set('noteId', 'test_notes_select');
    
    await page.goto(editorUrl.href, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#notesList', { timeout: 15000 });
    
    // Фокус на notes Select
    await page.focus('#notesList');
    await page.waitForTimeout(300);
    
    // Скриншот с Select в фокусе
    await expect(page).toHaveScreenshot('editor-notes-select-focus.png', {
      maxDiffPixelRatio: 0.2,
    });
  });
});
