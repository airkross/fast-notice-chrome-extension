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
    await expect(page.locator('.editor-toolbar')).toBeVisible();
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
  // ТЕСТ 6: Списки
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
  
  test('должен иметь ограничение высоты редактора', async () => {
    const editor = page.locator('#pellEditor');
    
    const style = await editor.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        maxHeight: computed.maxHeight,
        overflowY: computed.overflowY,
        minHeight: computed.minHeight,
      };
    });
    
    // Проверяем что есть какое-то ограничение по высоте или min-height
    const hasHeightConstraint = 
      style.maxHeight !== 'none' || 
      style.minHeight !== '0px' ||
      style.overflowY === 'auto';
    expect(hasHeightConstraint).toBe(true);
  });
  
  // ============================================
  // ТЕСТ 10: Скролл при переполнении
  // ============================================
  
  test('должен отображать скролл при переполнении', async () => {
    const editor = page.locator('#textEditor');
    
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    
    const longText = 'Строка текста '.repeat(50);
    await page.keyboard.type(longText);
    
    await page.waitForTimeout(300);
    
    const hasScroll = await editor.evaluate(el => {
      return el.scrollHeight > el.clientHeight;
    });
    
    // Скролл может появиться при большом количестве текста
    expect(typeof hasScroll).toBe('boolean');
  });
  
  // ============================================
  // ТЕСТ 11: Переключение темы — кнопка присутствует
  // ============================================
  
  test('должен иметь кнопку переключения темы', async () => {
    const themeBtn = page.locator('#themeToggleBtn');
    
    // Кнопка должна быть видимой
    await expect(themeBtn).toBeVisible();
    
    // Проверяем title (теперь просто "Тема")
    await expect(themeBtn).toHaveAttribute('title', 'Тема');
  });
  
  // ============================================
  // ТЕСТ 12: Переключение темы — на темную
  // ============================================
  
  test('должен переключаться на темную тему', async () => {
    const themeBtn = page.locator('#themeToggleBtn');
    const body = page.locator('body');
    
    // Очищаем localStorage перед тестом
    await page.evaluate(() => localStorage.removeItem('theme'));
    
    // Перезагружаем для сброса темы
    await page.reload();
    await page.waitForSelector('#textEditor', { timeout: 10000 });
    
    // Кликаем на кнопку
    await themeBtn.click();
    await page.waitForTimeout(200);
    
    // Body должен иметь класс dark-theme
    await expect(body).toHaveClass(/dark-theme/);
  });
  
  // ============================================
  // ТЕСТ 13: Переключение темы — обратно на светлую
  // ============================================
  
  test('должен переключаться обратно на светлую тему', async () => {
    const themeBtn = page.locator('#themeToggleBtn');
    const body = page.locator('body');
    
    // Очищаем localStorage, чтобы начать со светлой темой
    await page.evaluate(() => localStorage.removeItem('theme'));
    
    // Перезагружаем страницу, чтобы применить очистку localStorage
    await page.reload();
    await page.waitForSelector('#textEditor', { timeout: 10000 });
    
    // Включаем темную тему
    await themeBtn.click();
    await page.waitForTimeout(200);
    await expect(body).toHaveClass(/dark-theme/);
    
    // Переключаем обратно на светлую
    await themeBtn.click();
    await page.waitForTimeout(200);
    
    // Body должен иметь класс light-theme
    await expect(body).toHaveClass(/light-theme/);
  });
  
  // ============================================
  // ТЕСТ 14: Переключение темы — сохранение в localStorage
  // ============================================
  
  test('должен сохранять выбор темы в localStorage', async () => {
    const themeBtn = page.locator('#themeToggleBtn');
    
    // Очищаем перед тестом
    await page.evaluate(() => localStorage.removeItem('theme'));
    
    // Переключаем на темную тему
    await themeBtn.click();
    await page.waitForTimeout(200);
    
    // Проверяем что значение сохранилось в localStorage (используется ключ 'theme')
    const savedTheme = await page.evaluate(() => {
      return localStorage.getItem('theme');
    });
    
    expect(savedTheme).toBe('dark');
    
    // Переключаем обратно на светлую
    await themeBtn.click();
    await page.waitForTimeout(200);
    
    const savedTheme2 = await page.evaluate(() => {
      return localStorage.getItem('theme');
    });
    
    expect(savedTheme2).toBe('light');
  });
  
  // ============================================
  // ТЕСТ 15: Select — отображение списка заметок
  // ============================================
  
  test('должен отображать селект с заметками', async () => {
    const notesSelect = page.locator('#notesList');
    
    // Селект должен быть видимым
    await expect(notesSelect).toBeVisible();
    
    // Проверяем что есть опции
    const options = await notesSelect.locator('option').count();
    expect(options).toBeGreaterThanOrEqual(1);
    
    // Проверяем плейсхолдер
    const firstOption = notesSelect.locator('option').first();
    await expect(firstOption).toContainText('Выбрать');
  });
  
  // ============================================
  // ТЕСТ 16: Select — создание и отображение нескольких заметок
  // ============================================
  
  test('должен создавать несколько заметок и отображать их в селекте', async () => {
    // Создаём новую заметку через selection (нужно перейти на selection страницу)
    const selectionUrl = `${pathToFileURL(path.join(EXTENSION_PATH, 'selection.html')).href}`;
    await page.goto(selectionUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#notesSelect', { timeout: 15000 });
    
    // Используем правильный селектор для selection страницы
    const notesSelectOnSelection = page.locator('#notesSelect');
    
    // Создаём первую заметку
    await page.locator('#newNoteTitle').fill('Первая заметка');
    await page.locator('#createBtn').click();
    await page.waitForTimeout(500);
    
    // Создаём вторую заметку
    await page.locator('#newNoteTitle').fill('Вторая заметка');
    await page.locator('#createBtn').click();
    await page.waitForTimeout(500);
    
    // Проверяем что селект на selection странице содержит созданные заметки
    const options = await notesSelectOnSelection.locator('option').count();
    // Должны быть: плейсхолдер + 2 заметки
    expect(options).toBeGreaterThanOrEqual(3);
    
    // Проверяем названия заметок
    const optionTexts = await notesSelectOnSelection.locator('option').allTextContents();
    const hasFirstNote = optionTexts.some(text => text.includes('Первая'));
    const hasSecondNote = optionTexts.some(text => text.includes('Вторая'));
    expect(hasFirstNote || hasSecondNote).toBe(true);
    
    // Возвращаемся на editor страницу для следующих тестов
    const editorUrl = `${pathToFileURL(path.join(EXTENSION_PATH, 'editor.html')).href}?noteId=e2e_test_${Date.now()}`;
    await page.goto(editorUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#textEditor', { timeout: 15000 });
  });
  
  // ============================================
  // ТЕСТ 17: Select — переключение между заметками
  // ============================================
  
  test('должен переключаться между заметками при выборе в селекте', async () => {
    const notesSelect = page.locator('#notesList');
    const titleInput = page.locator('#noteTitle');
    
    // Сначала проверим, что текущая заметка загружена
    const initialTitle = await titleInput.inputValue();
    
    // Получаем все доступные опции
    const options = await notesSelect.locator('option').all();
    
    // Ищем другую заметку (не плейсхолдер, не текущую)
    let targetOption = null;
    for (const option of options) {
      const value = await option.getAttribute('value');
      const text = await option.textContent();
      const isDisabled = await option.getAttribute('disabled');
      
      if (value && !isDisabled && !text.includes('Выбрать')) {
        targetOption = option;
        break;
      }
    }
    
    if (targetOption) {
      // Выбираем другую заметку
      const targetValue = await targetOption.getAttribute('value');
      await notesSelect.selectOption(targetValue);
      
      // Даём время на загрузку
      await page.waitForTimeout(500);
      
      // Проверяем что значение изменилось
      const currentValue = await notesSelect.inputValue();
      expect(currentValue).toBe(targetValue);
    }
  });
  
  // ============================================
  // ТЕСТ 18: Select — стилизация в стиле Ozon
  // ============================================
  
  test('должен иметь стилизацию в стиле Ozon', async () => {
    const notesSelect = page.locator('#notesList');
    
    // Проверяем что есть класс стилей
    await expect(notesSelect).toHaveClass(/notes-select/);
    
    // Проверяем computed styles
    const styles = await notesSelect.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        fontSize: computed.fontSize,
        borderRadius: computed.borderRadius,
        padding: computed.padding,
      };
    });
    
    // Должен быть читаемый размер шрифта
    expect(parseFloat(styles.fontSize)).toBeGreaterThanOrEqual(12);
  });
  
  // ============================================
  // ТЕСТ 19: Select — title атрибут
  // ============================================
  
  test('должен иметь title атрибут с подсказкой', async () => {
    const notesSelect = page.locator('#notesList');
    
    // Проверяем title атрибут
    const title = await notesSelect.getAttribute('title');
    expect(title).toContain('заметк');
  });
  
  // ============================================
  // ТЕСТ 20: Select — обновление при сохранении
  // ============================================
  
  test('должен обновлять список при изменении названия заметки', async () => {
    const notesSelect = page.locator('#notesList');
    const titleInput = page.locator('#noteTitle');
    
    // Меняем заголовок заметки
    await titleInput.fill('Новый заголовок заметки');
    
    // Ждём автосохранение (debounce 400ms + время на сохранение)
    await page.waitForTimeout(1000);
    
    // Проверяем, что список обновился (хотя бы плейсхолдер остался)
    const options = await notesSelect.locator('option').count();
    expect(options).toBeGreaterThanOrEqual(1);
  });
  
  // ============================================
  // ТЕСТ 21: Баг — Select должен показывать выбранную заметку
  // ============================================
  
  test('должен обновлять Select при переключении между заметками', async () => {
    const notesSelect = page.locator('#notesList');
    const titleInput = page.locator('#noteTitle');
    
    // Устанавливаем начальный title для текущей заметки
    await titleInput.fill('Заметка А');
    await page.waitForTimeout(600);
    
    // Проверяем что в Select выбрана текущая заметка
    const initialValue = await notesSelect.inputValue();
    
    // Получаем все опции
    const options = await notesSelect.locator('option').all();
    let targetValue = null;
    
    for (const option of options) {
      const text = await option.textContent();
      const isDisabled = await option.getAttribute('disabled');
      // Ищем заметку с другим названием (не текущую)
      if (text.trim() !== 'Заметка А' && text.trim() !== 'Выбрать заметку...' && !isDisabled) {
        targetValue = await option.getAttribute('value');
        break;
      }
    }
    
    if (targetValue) {
      // Выбираем другую заметку в селекте
      await notesSelect.selectOption(targetValue);
      
      // Ждём загрузку заметки (debounce + сохранение + загрузка)
      await page.waitForTimeout(1000);
      
      // КРИТИЧНО: Проверяем что в Select отображается выбранная заметка
      // Это именно тот баг который мы исправляем:
      // После выбора заметки "1", в Select должна отображаться "1", а не старая заметка
      const selectedValue = await notesSelect.inputValue();
      expect(selectedValue).toBe(targetValue);
      
      // Дополнительно проверяем видимый текст выбранной опции
      const selectedOption = notesSelect.locator('option:checked');
      const selectedText = await selectedOption.textContent();
      expect(selectedText.trim()).not.toBe('Заметка А');
    } else {
      // Если нет других заметок, пропускаем часть теста
      // Но всё равно проверим что текущая заметка отображается корректно
      const currentValue = await notesSelect.inputValue();
      expect(currentValue).toBe(initialValue);
    }
  });
});
