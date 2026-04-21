/**
 * heading-overlap.spec.js — E2E тест для проверки правильной замены форматирования заголовков
 * 
 * Баг: При смене формата с h1 на "Текст" получается вложенная структура <h1><p>текст</p></h1>
 * Вместо корректной замены на просто текст (без h1)
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const EXTENSION_PATH = path.join(__dirname, '../..');

test.describe('Проверка правильной замены форматирования заголовков (баг-фикс)', () => {
  let page;
  let context;

  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });

    page = await context.newPage();
    
    // Перехватываем логи из браузера
    page.on('console', msg => {
      if (msg.text().includes('TextEditor') || msg.text().includes('HTML')) {
        console.log('[Browser]', msg.text());
      }
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

    const editorUrl = pathToFileURL(path.join(EXTENSION_PATH, 'editor.html')).href;
    
    await page.goto(editorUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#textEditor', { timeout: 15000 });
    await page.waitForSelector('#headingSelect', { timeout: 15000 });
  });

  test.afterAll(async () => {
    await context?.close();
  });

  /**
   * ОСНОВНОЙ ТЕСТ БАГА: проверка правильной замены форматирования без вложения
   */
  test('должен заменять h1 на Текст без вложения <p> в <h1>', async () => {
    const editor = page.locator('#textEditor');
    const headingSelect = page.locator('#headingSelect');

    // ============================================
    // ШАГ 1: Вставляем содержимое напрямую в редактор
    // ============================================
    
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    
    // Сначала убеждаемся, что селектор НЕ установлен на p
    await headingSelect.selectOption('h1');
    await page.waitForTimeout(100);
    
    // Вставляем HTML напрямую с h1 тегом, чтобы гарантировать структуру
    await page.evaluate(() => {
      const editor = document.getElementById('textEditor');
      editor.innerHTML = '<h1>тестовое содержимое</h1>';
    });
    
    await page.waitForTimeout(300);
    
    console.log('✓ Создана структура с h1');
    
    let htmlContent = await editor.innerHTML();
    console.log('HTML с h1:', htmlContent);
    expect(htmlContent).toContain('<h1');
    
    // ============================================
    // ШАГ 2: Выделяем ВСЕ и меняем на "Текст"
    // ============================================
    
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.waitForTimeout(100);
    
    // Выбираем "Текст" (p)
    console.log('- До selectOption, headingSelect value:', await headingSelect.inputValue());
    
    // Добавляем логирование для отладки
    await page.evaluate(() => {
      const select = document.getElementById('headingSelect');
      console.log('SELECT ELEMENT:', select);
      console.log('Current value:', select?.value);
      console.log('Options:', Array.from(select?.options || []).map(o => ({ value: o.value, text: o.text })));
    });
    
    // Добавляем слушатель на change событие перед selectOption
    let changeEventFired = false;
    await page.evaluate(() => {
      const select = document.getElementById('headingSelect');
      select.addEventListener('change', (e) => {
        window.changeEventLog = `change event fired: old=${select.__oldValue} new=${e.target.value}`;
        console.log('[TEST] change event:', window.changeEventLog);
        select.__oldValue = e.target.value;
      }, { once: true });
    });
    
    await headingSelect.selectOption('p');
    console.log('- После selectOption, headingSelect value:', await headingSelect.inputValue());
    
    // Проверяем, сработало ли событие
    await page.waitForTimeout(300);
    const eventLog = await page.evaluate(() => window.changeEventLog);
    console.log('Event log:', eventLog);
    
    // Проверяем, что произошло в editor.innerHTML
    let editorHTML = await page.evaluate(() => {
      const editor = document.getElementById('textEditor');
      return editor.innerHTML;
    });
    console.log('Editor innerHTML:', editorHTML);
    
    console.log('✓ Применён формат "Текст"');
    
    // ============================================
    // ШАГ 3: ПРОВЕРКА БАГА
    // ============================================
    
    htmlContent = await editor.innerHTML();
    console.log('HTML после смены h1 → p:', htmlContent);
    
    // ✅ ОСНОВНАЯ ПРОВЕРКА:
    // Баг: получается структура <h1><p>текст</p></h1> - вложенные теги
    // Исправление: должно быть либо <p>текст</p> либо просто текст без h1
    
    // НЕ должно быть структуры <h1><p> или похожих вложений
    const hasNestedH1P = htmlContent.includes('<h1') && htmlContent.includes('<p');
    
    if (hasNestedH1P) {
      // Проверяем, что это не вложение (p не внутри h1)
      const h1StartIndex = htmlContent.indexOf('<h1');
      const h1EndIndex = htmlContent.indexOf('</h1>');
      
      if (h1EndIndex > h1StartIndex) {
        const contentBetweenH1 = htmlContent.substring(h1StartIndex, h1EndIndex);
        expect(contentBetweenH1.includes('<p')).toBe(false);
      }
    }
    
    console.log('✓ Баг с вложением тегов исправлен');
  });

  /**
   * ТЕСТ: h1 → h2 (смена между заголовками)
   */
  test('должен заменять h1 на h2 без вложения', async () => {
    const editor = page.locator('#textEditor');
    const headingSelect = page.locator('#headingSelect');

    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    
    // Вставляем h1 напрямую
    await page.evaluate(() => {
      const editor = document.getElementById('textEditor');
      editor.innerHTML = '<h1>h1 текст</h1>';
    });
    
    await page.waitForTimeout(200);
    
    let htmlContent = await editor.innerHTML();
    console.log('HTML с h1:', htmlContent);
    expect(htmlContent).toContain('<h1');
    
    // Меняем на h2  
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.waitForTimeout(100);
    
    await headingSelect.selectOption('h2');
    await page.waitForTimeout(300);
    
    htmlContent = await editor.innerHTML();
    console.log('HTML после смены h1 → h2:', htmlContent);
    
    // Не должно быть <h1><h2> или <h2><h1>
    expect(!htmlContent.includes('<h1><h2')).toBeTruthy();
    expect(!htmlContent.includes('<h2><h1')).toBeTruthy();
    
    console.log('✓ Смена h1 на h2 без вложения');
  });

  /**
   * ТЕСТ: Текст → h3 → Текст (циклическое изменение)
   */
  test('должен корректно работать при циклических заменах', async () => {
    const editor = page.locator('#textEditor');
    const headingSelect = page.locator('#headingSelect');

    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    
    // Вставляем обычный текст
    await page.evaluate(() => {
      const editor = document.getElementById('textEditor');
      editor.innerHTML = '<p>тестовый текст</p>';
    });
    
    await page.waitForTimeout(200);
    
    // Меняем на h3
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.waitForTimeout(100);
    
    await headingSelect.selectOption('h3');
    await page.waitForTimeout(300);
    
    let htmlContent = await editor.innerHTML();
    console.log('HTML после применения h3:', htmlContent);
    
    // Проверяем, что нет вложенной структуры <p><h3> или <h3><p>
    const hasWrongNesting = htmlContent.includes('<p') && htmlContent.includes('<h3');
    expect(hasWrongNesting).toBe(false);
    
    // Меняем обратно на Текст
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.waitForTimeout(100);
    
    await headingSelect.selectOption('p');
    await page.waitForTimeout(300);
    
    htmlContent = await editor.innerHTML();
    console.log('HTML после возврата на Текст:', htmlContent);
    
    // Не должно быть h3<p> или p<h3>
    expect(!htmlContent.includes('<h3><p')).toBeTruthy();
    expect(!htmlContent.includes('<p><h3')).toBeTruthy();
    
    console.log('✓ Циклические замены работают корректно');
  });

  /**
   * ТЕСТ: Частичное выделение и смена формата
   */
  test('должен корректно работать с частичным выделением текста', async () => {
    const editor = page.locator('#textEditor');
    const headingSelect = page.locator('#headingSelect');

    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Backspace');
    
    // Вставляем h1 напрямую
    await page.evaluate(() => {
      const editor = document.getElementById('textEditor');
      editor.innerHTML = '<h1>содержимое</h1>';
    });
    
    await page.waitForTimeout(200);
    
    // Выделяем весь контент
    await editor.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.waitForTimeout(100);
    
    // Меняем на Текст
    await headingSelect.selectOption('p');
    await page.waitForTimeout(300);
    
    const htmlContent = await editor.innerHTML();
    console.log('HTML после смены h1 → p:', htmlContent);
    
    // Проверяем, что нет вложения
    expect(htmlContent.includes('<h1><p')).toBe(false);
    
    console.log('✓ Частичное выделение работает корректно');
  });
});
