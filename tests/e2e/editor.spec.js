/**
 * editor.spec.js — E2E тесты для расширения "Быстрые заметки"
 * Запуск: npm run test:e2e
 *
 * Тесты открывают локальную страницу editor.html и подставляют минимальный
 * stub chrome.runtime, чтобы не требовать ручной установки unpacked extension.
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const EXTENSION_PATH = path.join(__dirname, '../..');

// ============================================
// ТЕСТЫ
// ============================================

test.describe('Быстрые заметки — E2E тесты', () => {
  
  let page;
  let context;
  
  // Открываем локальную страницу editor.html с подставленным chrome.runtime stub
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });

    await context.addInitScript(() => {
      const noteStore = new Map();

      function getAllNotes() {
        return Array.from(noteStore.entries()).reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});
      }

      function makeSummary() {
        return Array.from(noteStore.entries()).map(([noteId, value]) => ({
          id: noteId,
          key: `note_${noteId}`,
          title: value.title?.trim() || '',
          preview: (value.content || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) + ((value.content || '').length >= 60 ? '...' : ''),
          timestamp: value.timestamp || 0,
          createdAt: value.createdAt || 0,
          hasContent: !!((value.content || '').trim() || (value.title || '').trim()),
        })).sort((a, b) => b.timestamp - a.timestamp);
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
                const newId = `e2e_test_${now}`;
                const data = {
                  content: '',
                  title: request.title || '',
                  format: 'markdown',
                  timestamp: now,
                  createdAt: now,
                };
                noteStore.set(newId, data);
                return { success: true, noteId: newId };
              },
              OPEN_NOTE: () => {
                return { success: true };
              },
              DELETE_NOTE: () => {
                noteStore.delete(noteId);
                return { success: true };
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
              DEBUG_DUMP: () => Array.from(noteStore.entries()).map(([key, value]) => ({
                key: `note_${key}`,
                title: value.title || '(без заголовка)',
                content: (value.content || '').slice(0, 50) + '...',
                timestamp: new Date(value.timestamp || 0).toLocaleString('ru-RU'),
              })),
              CLOSE_TAB: () => ({ success: true }),
              OPEN_SELECTION: () => ({ success: true }),
            };

            if (handlers[request.type]) {
              response = handlers[request.type]();
            }

            window.chrome.runtime.lastError = null;
            if (typeof callback === 'function') callback(response);
          },
          lastError: null,
          onInstalled: { addListener: () => {} },
        },
        storage: {
          local: {
            get: async (keys) => {
              const all = getAllNotes();
              if (keys === null) return all;
              if (Array.isArray(keys)) {
                return keys.reduce((result, key) => {
                  result[key] = all[key];
                  return result;
                }, {});
              }
              return { [keys]: all[keys] };
            },
            set: async (items) => {
              Object.entries(items).forEach(([key, value]) => {
                noteStore.set(key.replace(/^note_/, ''), value);
              });
            },
            remove: async (keys) => {
              if (Array.isArray(keys)) {
                keys.forEach((key) => noteStore.delete(key.replace(/^note_/, '')));
              } else {
                noteStore.delete(keys.replace(/^note_/, ''));
              }
            },
          },
        },
        tabs: {
          update: async (tabId, info) => {
            if (info.url) window.location.href = info.url;
            return {};
          },
          remove: async () => ({ success: true }),
          create: async () => ({ success: true }),
        },
        action: { onClicked: { addListener: () => {} } },
      };
    });

    page = await context.newPage();
    const editorUrl = `${pathToFileURL(path.join(EXTENSION_PATH, 'editor.html')).href}?noteId=e2e_test_${Date.now()}`;

    console.log(`🔗 Открываем: ${editorUrl}`);
    await page.goto(editorUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#textEditor', { timeout: 15000 });
  });
  
  test.afterAll(async () => {
    await context?.close();
  });
  
  // ============================================
  // ТЕСТ 1: Отображение интерфейса
  // ============================================
  
  test('должен отображать редактор с панелью инструментов', async () => {
    await expect(page.locator('#textEditor')).toBeVisible();
    await expect(page.locator('#textEditorToolbar')).toBeVisible();
    await expect(page.locator('#noteTitle')).toBeVisible();
    await expect(page.locator('#notesList')).toBeVisible();
    await expect(page.locator('#headingSelect')).toBeVisible();
    await expect(page.locator('#linkBtn')).toBeVisible();
  });
  
  // ============================================
  // ТЕСТ 2: Жирный текст
  // ============================================
  
  test('должен применять форматирование жирный', async () => {
    const editor = page.locator('#textEditor');
    
    // Очищаем редактор
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    
    // Вводим текст
    await page.keyboard.type('Тестовый текст');
    
    // Выделяем весь текст
    await page.keyboard.press('ControlOrMeta+A');
    
    // Применяем жирный
    await page.locator('[data-command="bold"]').click();
    
    // Проверяем результат
    const html = await editor.evaluate(el => el.innerHTML);
    expect(html).toMatch(/<(strong|b)>/);
    expect(html).toContain('Тестовый текст');
  });
  
  // ============================================
  // ТЕСТ 3: Заголовки
  // ============================================
  
  test('должен применять заголовки H1-H5', async () => {
    const editor = page.locator('#textEditor');
    
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('Заголовок 1');
    await page.keyboard.press('ControlOrMeta+A');
    
    // H1
    await page.locator('#headingSelect').selectOption('h1');
    let html = await editor.evaluate(el => el.innerHTML);
    expect(html).toContain('<h1>');
    
    // H2
    await page.keyboard.press('ControlOrMeta+A');
    await page.locator('#headingSelect').selectOption('h2');
    html = await editor.evaluate(el => el.innerHTML);
    expect(html).toContain('<h2>');
  });
  
  // ============================================
  // ТЕСТ 4: Переключение форматов
  // ============================================
  
  test('должен отображать заголовок и список заметок', async () => {
    await expect(page.locator('#noteTitle')).toHaveAttribute('placeholder', expect.stringContaining('Заголовок заметки'));
    await expect(page.locator('#notesList')).toBeVisible();
    const options = await page.locator('#notesList option').count();
    expect(options).toBeGreaterThanOrEqual(1);
  });
  
  // ============================================
  // ТЕСТ 5: Вставка Markdown
  // ============================================
  
  test('должен вставлять Markdown при вставке', async () => {
    const editor = page.locator('#textEditor');

    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');

    await page.evaluate(() => {
      const editor = document.querySelector('#textEditor');
      const text = '# Заголовок\n**жирный текст**';
      editor.focus();
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', text);
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData,
      });
      editor.dispatchEvent(pasteEvent);
    });

    await page.waitForTimeout(500);

    const html = await editor.evaluate(el => el.innerHTML);
    expect(html).toContain('<h1>');
    expect(html).toContain('<strong>');
  });
  
  // ============================================
  // ТЕСТ 6: Копирование Markdown
  // ============================================
  
  test('должен открывать окно отладки', async () => {
    await page.locator('#debugBtn').click();
    await expect(page.locator('#debugModal')).toBeVisible();
    await page.locator('#closeModal').click();
    await expect(page.locator('#debugModal')).toBeHidden();
  });
  
  // ============================================
  // ТЕСТ 7: Списки
  // ============================================
  
  test('должен создавать списки', async () => {
    const editor = page.locator('#textEditor');
    
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('Элемент 1');
    await page.keyboard.press('ControlOrMeta+A');
    
    // Маркированный список
    await page.locator('[data-command="insertUnorderedList"]').click();
    
    let html = await editor.evaluate(el => el.innerHTML);
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>');
    
    // Нумерованный список
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('Элемент 1');
    await page.keyboard.press('ControlOrMeta+A');
    
    await page.locator('[data-command="insertOrderedList"]').click();
    
    html = await editor.evaluate(el => el.innerHTML);
    expect(html).toContain('<ol>');
    expect(html).toContain('<li>');
  });
  
  // ============================================
  // ТЕСТ 8: Ссылки
  // ============================================
  
  test('должен вставлять ссылки', async () => {
    page.on('dialog', async dialog => {
      if (dialog.type() === 'prompt') {
        await dialog.accept('https://example.com');
      } else {
        await dialog.dismiss();
      }
    });
    
    const editor = page.locator('#textEditor');
    
    await editor.click();
    await page.keyboard.type('Текст ссылки');
    await page.keyboard.press('ControlOrMeta+A');
    
    await page.locator('#linkBtn').click();
    await page.waitForTimeout(300);
    
    const html = await editor.evaluate(el => el.innerHTML);
    expect(html).toContain('<a');
    expect(html).toContain('href="https://example.com"');
  });
  
  // ============================================
  // ТЕСТ 9: Ограничение высоты
  // ============================================
  
  test('должен ограничивать высоту редактора', async () => {
    const editor = page.locator('#textEditor');
    
    const style = await editor.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        maxHeight: computed.maxHeight,
        overflowY: computed.overflowY,
      };
    });
    
    expect(style.maxHeight).toMatch(/px$/);
    expect(parseFloat(style.maxHeight)).toBeGreaterThan(0);
    expect(style.overflowY).toBe('auto');
  });
  
  // ============================================
  // ТЕСТ 10: Скролл при переполнении
  // ============================================
  
  test('должен отображать скролл при переполнении', async () => {
    const editor = page.locator('#textEditor');
    
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    
    const longText = 'Строка текста '.repeat(200);
    await page.keyboard.type(longText);
    
    await page.waitForTimeout(500);
    
    const hasScroll = await editor.evaluate(el => {
      return el.scrollHeight > el.clientHeight;
    });
    
    expect(hasScroll).toBe(true);
  });
});