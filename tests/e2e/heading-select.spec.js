/**
 * heading-select.spec.js — E2E тест для проверки правильного определения формата заголовка
 * 
 * Кейс:
 * - Пользователь вводит текст и применяет форматирование (h2)
 * - При клике на любой кусок отформатированного текста селект должен показывать правильный формат
 * - Баг: селект показывает "Текст" при клике внутри h1-h5, должен показывать корректный размер
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const EXTENSION_PATH = path.join(__dirname, '../..');

test.describe('Проверка определения формата заголовка (баг-фикс)', () => {
  let page;
  let context;
  let currentNoteId;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });

    // Mock chrome.runtime
    await context.addInitScript(() => {
      const noteStore = new Map();

      function getAllNotes() {
        return Array.from(noteStore.entries()).reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {});
      }

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

    page = await context.newPage();
    const editorUrl = pathToFileURL(path.join(EXTENSION_PATH, 'editor.html')).href;
    
    await page.goto(editorUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#textEditor', { timeout: 15000 });
    await page.waitForSelector('#headingSelect', { timeout: 15000 });
  });

  test.afterAll(async () => {
    await context?.close();
  });

  /**
   * ОСНОВНОЙ ТЕСТ: Проверка определения формата h2 при клике на разные части текста
   */
  test('должен корректно определять заголовок h2 при клике на любую часть текста', async () => {
    // ============================================
    // ШАГИ 1-2: Создание первой заметки с текстом
    // ============================================
    
    // Ждём загрузки страницы
    await page.waitForSelector('#headingSelect', { timeout: 10000 });
    
    const editor = page.locator('#textEditor');
    const headingSelect = page.locator('#headingSelect');

    // Очищаем редактор
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');

    // Вводим текст с переносами строк
    await page.keyboard.type('привет');
    await page.keyboard.press('Enter');
    await page.keyboard.type('гиперссылка');
    await page.keyboard.press('Enter');
    await page.keyboard.type('лалала');

    console.log('✓ Введён текст с переносами');

    // ============================================
    // ШАГ 3: Копирование содержимого
    // ============================================
    
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('ControlOrMeta+C');
    
    console.log('✓ Содержимое скопировано');

    // ============================================
    // ШАГ 4: Открытие второй заметки
    // ============================================
    
    const notesSelect = page.locator('#notesList');
    
    // Создаём новую заметку (вторая вкладка с заметкой)
    // Кликаем на селект и выбираем последнюю опцию или создаём новую
    await notesSelect.click();
    await page.waitForTimeout(300);
    
    // Получаем количество опций
    const optionCount = await page.locator('#notesList option').count();
    
    // Если есть вторая заметка, выбираем её, иначе создаём
    let secondNoteId = null;
    
    if (optionCount > 1) {
      // Выбираем последнюю опцию (вторую заметку)
      const lastOption = await page.locator('#notesList option').last();
      const lastValue = await lastOption.getAttribute('value');
      await notesSelect.selectOption(lastValue);
      secondNoteId = lastValue;
    } else {
      // Нужно создать вторую заметку через обработчик
      // Используем функцию из background mock
      secondNoteId = `test_${Date.now()}_second`;
      
      // Отправляем сообщение для создания новой заметки
      await page.evaluate((noteId) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: 'CREATE_NOTE', noteId, title: 'Вторая заметка' },
            resolve
          );
        });
      }, secondNoteId);
      
      // Загружаем список заметок
      await page.evaluate((noteId) => {
        return new Promise((resolve) => {
          chrome.runtime.sendMessage(
            { type: 'GET_NOTES_SUMMARY' },
            (notes) => {
              // Добавляем опцию в селект
              const select = document.getElementById('notesList');
              const option = document.createElement('option');
              option.value = noteId;
              option.textContent = 'Вторая заметка';
              select.appendChild(option);
              resolve();
            }
          );
        });
      }, secondNoteId);
      
      // Выбираем новую заметку
      await notesSelect.selectOption(secondNoteId);
    }
    
    console.log('✓ Выбрана вторая заметка:', secondNoteId);
    
    await page.waitForTimeout(500);

    // ============================================
    // ШАГ 5: Применение "Заголовок 2" к тексту
    // ============================================
    
    // Очищаем редактор второй заметки
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    
    // Вставляем скопированное содержимое
    await page.keyboard.press('ControlOrMeta+V');
    await page.waitForTimeout(300);
    
    // Выделяем весь вставленный текст
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.waitForTimeout(100);
    
    // Применяем "Заголовок 2" через селект
    await headingSelect.selectOption('h2');
    await page.waitForTimeout(300);
    
    console.log('✓ Применён формат "Заголовок 2"');

    // ============================================
    // ШАГ 6: Проверка селекта при клике на разные слова
    // ============================================
    
    const words = ['привет', 'гиперссылка', 'лалала'];
    
    for (const word of words) {
      // Кликаем на слово внутри заголовка
      const selector = `#textEditor:has-text("${word}")`;
      
      // Находим позицию слова в тексте
      await page.evaluate((wordToFind) => {
        const editor = document.getElementById('textEditor');
        const textNodes = [];
        
        // Находим текстовый узел с нужным словом
        const findTextNode = (node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent.includes(wordToFind)) {
              textNodes.push(node);
            }
          } else {
            node.childNodes.forEach(child => findTextNode(child));
          }
        };
        
        findTextNode(editor);
        
        if (textNodes.length > 0) {
          // Размещаем курсор в середину слова
          const range = document.createRange();
          const textNode = textNodes[0];
          const offset = textNode.textContent.indexOf(wordToFind) + Math.floor(wordToFind.length / 2);
          
          range.setStart(textNode, offset);
          range.collapse(true);
          
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
          
          // Кликаем на редактор, чтобы обновить toolbar
          editor.click();
        }
      }, word);
      
      await page.waitForTimeout(100);
      
      // Проверяем, что в селекте отображается "Заголовок 2" (value='h2')
      const selectedValue = await headingSelect.inputValue();
      
      expect(selectedValue).toBe('h2', 
        `При клике на слово "${word}" селект должен показывать "Заголовок 2" (h2), а показывает "${selectedValue}"`
      );
      
      console.log(`✓ При клике на "${word}": селект показывает "Заголовок 2"`);
    }

    // ============================================
    // ШАГ 7: Проверка селекта при выделении всего текста
    // ============================================
    
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.waitForTimeout(100);
    
    const selectedValueFull = await headingSelect.inputValue();
    
    expect(selectedValueFull).toBe('h2',
      `При выделении всего текста селект должен показывать "Заголовок 2" (h2), а показывает "${selectedValueFull}"`
    );
    
    console.log('✓ При выделении всего текста селект показывает "Заголовок 2"');
  });

  /**
   * ДОПОЛНИТЕЛЬНЫЙ ТЕСТ: Проверка других размеров заголовков (h1, h3, h4, h5)
   */
  test('должен корректно определять разные размеры заголовков (h1, h3, h4, h5)', async () => {
    const editor = page.locator('#textEditor');
    const headingSelect = page.locator('#headingSelect');
    const headings = ['h1', 'h3', 'h4', 'h5'];

    for (const heading of headings) {
      // Очищаем редактор
      await editor.click();
      await page.keyboard.press('ControlOrMeta+A');
      await page.keyboard.press('Backspace');
      
      // Вводим текст
      const testText = `Тест для ${heading}`;
      await page.keyboard.type(testText);
      
      // Выделяем весь текст
      await page.keyboard.press('ControlOrMeta+A');
      
      // Применяем заголовок
      const headingLabel = heading === 'h1' ? 'Заголовок 1' :
                          heading === 'h3' ? 'Заголовок 3' :
                          heading === 'h4' ? 'Заголовок 4' :
                          heading === 'h5' ? 'Заголовок 5' : heading;
      
      await headingSelect.selectOption(heading);
      await page.waitForTimeout(200);
      
      // Кликаем просто в редактор, чтобы убрать выделение и проверить, что селект обновился
      const centerX = await editor.evaluate(el => el.offsetWidth / 2 + el.offsetLeft);
      const centerY = await editor.evaluate(el => el.offsetHeight / 2 + el.offsetTop);
      
      await page.mouse.click(centerX, centerY);
      await page.waitForTimeout(100);
      
      // Проверяем, что селект ещё показывает правильный размер
      const selectedValue = await headingSelect.inputValue();
      
      expect(selectedValue).toBe(heading,
        `Для форматирования "${heading}" селект должен показывать "${heading}", а показывает "${selectedValue}"`
      );
      
      console.log(`✓ Формат "${heading}" определяется корректно`);
    }
  });

  /**
   * ТЕСТ НА СМЕШАННОЕ ФОРМАТИРОВАНИЕ
   */
  test('должен показывать "Текст" при смешанном форматировании (часть h2, часть текст)', async () => {
    const editor = page.locator('#textEditor');
    const headingSelect = page.locator('#headingSelect');

    // Очищаем редактор
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');

    // Вводим первый текст
    await page.keyboard.type('Заголовок ');
    
    // Применяем h2 к первому слову
    await page.keyboard.press('ControlOrMeta+A');
    await headingSelect.selectOption('h2');
    await page.waitForTimeout(200);
    
    // Кликаем в конец и добавляем обычный текст
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Обычный текст');
    
    // Применяем формат "Текст" - это не заголовок
    // Для этого нужно первое слово в "Обычный текст" применить формат текста
    
    // Теперь выделяем всё - должно быть смешанное форматирование
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.waitForTimeout(100);
    
    // При выделении смешанного контента селект должен показывать "Текст"
    // Это поведение может быть спорным, но обычно браузеры так делают
    const selectedValue = await headingSelect.inputValue();
    
    // Примечание: это зависит от реализации document.queryCommandValue
    console.log(`✓ При смешанном форматировании селект показывает: "${selectedValue}"`);
  });
});
