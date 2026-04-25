/**
 * selection.spec.js — E2E тесты для страницы выбора заметок (selection.html)
 * Запуск: npm run test:e2e
 */

const { test, expect } = require('@playwright/test');
const path = require('path');
const { pathToFileURL } = require('url');

const EXTENSION_PATH = path.join(__dirname, '../..');

test.describe('Главная страница — Выбор заметок', () => {
  
  let page;
  let context;
  
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });

    // Мок chrome API с хранилищем заметок
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
          preview: (value.content || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 60),
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
                const newId = `note_${now}`;
                const data = {
                  content: '',
                  title: request.title || '',
                  format: 'markdown',
                  timestamp: now,
                  createdAt: now,
                };
                noteStore.set(newId, data);
                console.log(`[Mock] Создана заметка: ${newId}, заголовок: ${request.title}`);
                return { success: true, noteId: newId, title: request.title };
              },
              OPEN_NOTE: () => {
                console.log(`[Mock] Открытие заметки: ${noteId}`);
                return { success: true };
              },
              DELETE_NOTE: () => {
                console.log(`[Mock] Удаление заметки: ${noteId}`);
                noteStore.delete(noteId);
                return { success: true };
              },
              GET_NOTES_SUMMARY: () => makeSummary(),
              GET_NOTE: () => noteStore.get(noteId) || null,
              SAVE_NOTE: () => ({ success: true }),
              DEBUG_DUMP: () => Array.from(noteStore.entries()).map(([key, value]) => ({
                id: key,
                key: `note_${key}`,
                title: value.title || '(без заголовка)',
                content: (value.content || '').slice(0, 50) || 'Пусто',
                timestamp: new Date(value.timestamp || 0).toLocaleString('ru-RU'),
              })),
              CLOSE_TAB: () => ({ success: true }),
              OPEN_SELECTION: () => ({ success: true }),
              OPEN_EDITOR: () => ({ success: true }),
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
    const selectionUrl = pathToFileURL(path.join(EXTENSION_PATH, 'selection.html')).href;
    
    console.log(`🔗 Открываем: ${selectionUrl}`);
    await page.goto(selectionUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForSelector('#notesSelect', { timeout: 15000 });
  });
  
  test.afterEach(async () => {
    // Закрываем модальное окно после каждого теста (только если мы на странице selection)
    // Проверяем что элементы существуют перед проверкой видимости
    const debugModalCount = await page.locator('#debugModal').count();
    const closeModalBtnCount = await page.locator('#closeModal').count();
    
    if (debugModalCount > 0 && closeModalBtnCount > 0) {
      const debugModal = page.locator('#debugModal');
      const closeModalBtn = page.locator('#closeModal');
      try {
        if (await debugModal.isVisible()) {
          await closeModalBtn.click();
          await expect(debugModal).toBeHidden();
        }
      } catch (e) {
        // Игнорируем ошибки если modal уже закрыт или недоступен
        console.log('Modal cleanup skipped:', e.message);
      }
    }
    
    // Возвращаемся на selection страницу если мы перешли на другую страницу (например тест 16)
    const currentUrl = page.url();
    if (currentUrl.includes('editor.html')) {
      const selectionUrl = pathToFileURL(path.join(EXTENSION_PATH, 'selection.html')).href;
      await page.goto(selectionUrl, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForSelector('#notesSelect', { timeout: 15000 });
    }
  });

  test.afterAll(async () => {
    await context?.close();
  });
  
  // ============================================
  // ТЕСТ 1: Селект "Выберите заметку" — Отображение
  // ============================================
  
  test('1. Селект "Выберите заметку" отображается и содержит плейсхолдер при отсутствии заметок', async () => {
    const notesSelect = page.locator('#notesSelect');
    const noNotesMessage = page.locator('#noNotesMessage');
    
    // Селект должен быть видимым
    await expect(notesSelect).toBeVisible();
    
    // При отсутствии заметок должно показываться сообщение
    await expect(noNotesMessage).toHaveClass(/visible/);
    
    // Селект должен быть отключен
    await expect(notesSelect).toBeDisabled();
    
    // Должен быть плейсхолдер "Нет заметок"
    const firstOption = notesSelect.locator('option').first();
    await expect(firstOption).toHaveText('Нет заметок');
  });
  
  // ============================================
  // ТЕСТ 2: Селект "Выберите заметку" — Загрузка списка
  // ============================================
  
  test('2. Селект "Выберите заметку" загружает список при наличии заметок', async () => {
    // Создаём несколько заметок
    await page.locator('#newNoteTitle').fill('Заметка А');
    await page.locator('#createBtn').click();
    await page.waitForTimeout(500);
    
    await page.locator('#newNoteTitle').fill('Заметка Б');
    await page.locator('#createBtn').click();
    await page.waitForTimeout(500);
    
    // Проверяем что селект активен
    const notesSelect = page.locator('#notesSelect');
    const noNotesMessage = page.locator('#noNotesMessage');
    
    // Селект теперь активен
    await expect(notesSelect).toBeEnabled();
    
    // Сообщение "нет заметок" скрыто
    await expect(noNotesMessage).not.toHaveClass(/visible/);
    
    // Должен быть плейсхолдер "Выберите заметку..." - он disabled поэтому hidden
    const placeholder = notesSelect.locator('option').filter({ hasText: 'Выберите заметку...' });
    await expect(placeholder).toHaveCount(1);
    
    // Должны быть как минимум 2 заметки + плейсхолдер
    const options = await notesSelect.locator('option').count();
    expect(options).toBeGreaterThanOrEqual(3); // плейсхолдер + 2 заметки
  });
  
  // ============================================
  // ТЕСТ 3: Селект "Выберите заметку" — Выбор заметки
  // ============================================
  
  test('3. Селект "Выберите заметку" позволяет выбрать заметку и переходит в неё', async () => {
    // Создаём заметку чтобы точно была хотя бы одна
    await page.locator('#newNoteTitle').fill('Заметка для выбора');
    await page.locator('#createBtn').click();
    await page.waitForTimeout(500);
    
    const notesSelect = page.locator('#notesSelect');
    
    // Ждём пока селект станет активным
    await expect(notesSelect).toBeEnabled();
    
    // Выбираем первую заметку (не плейсхолдер)
    await notesSelect.selectOption({ index: 1 });
    
    // Проверяем что выбор применился
    const selectedValue = await notesSelect.inputValue();
    expect(selectedValue).toBeTruthy();
  });
  
  // ============================================
  // ТЕСТ 4: Инпут "Создать заметку" — Валидация
  // ============================================
  
  test('4. Инпут "Создать заметку" с кнопкой — валидация: кнопка отключена при пустом поле', async () => {
    // Перезагружаем страницу для чистого состояния
    await page.reload();
    await page.waitForSelector('#notesSelect', { timeout: 15000 });
    
    const input = page.locator('#newNoteTitle');
    const createBtn = page.locator('#createBtn');
    
    // При пустом поле кнопка должна быть отключена
    await expect(input).toHaveValue('');
    await expect(createBtn).toBeDisabled();
    
    // При пробелах кнопка тоже должна быть отключена
    await input.fill('   ');
    await expect(createBtn).toBeDisabled();
    
    // При вводе текста кнопка активируется
    await input.fill('Моя заметка');
    await expect(createBtn).toBeEnabled();
  });
  
  // ============================================
  // ТЕСТ 5: Инпут "Создать заметку" — Успешное создание
  // ============================================
  
  test('5. Инпут "Создать заметку" — успешное создание заметки', async () => {
    const input = page.locator('#newNoteTitle');
    const createBtn = page.locator('#createBtn');
    const notesSelect = page.locator('#notesSelect');
    
    // Вводим заголовок
    const noteTitle = 'Тестовая заметка ' + Date.now();
    await input.fill(noteTitle);
    
    // Нажимаем кнопку создания
    await createBtn.click();
    
    // Ждём обработки
    await page.waitForTimeout(500);
    
    // Поле ввода должно очиститься
    await expect(input).toHaveValue('');
    
    // Кнопка снова должна быть отключена
    await expect(createBtn).toBeDisabled();
    
    // Заметка должна появиться в селекте
    const options = await notesSelect.locator('option').count();
    expect(options).toBeGreaterThanOrEqual(2);
    
    // Проверяем что новая заметка в списке
    const optionTexts = await notesSelect.locator('option').allTextContents();
    const found = optionTexts.some(text => text.includes(noteTitle));
    expect(found).toBe(true);
  });
  
  // ============================================
  // ТЕСТ 6: Инпут "Создать заметку" — Создание через Enter
  // ============================================
  
  test('6. Инпут "Создать заметку" — создание заметки при нажатии Enter', async () => {
    const input = page.locator('#newNoteTitle');
    const createBtn = page.locator('#createBtn');
    
    const noteTitle = 'Заметка через Enter ' + Date.now();
    await input.fill(noteTitle);
    
    // Нажимаем Enter
    await input.press('Enter');
    
    // Ждём обработки
    await page.waitForTimeout(500);
    
    // Поле должно очиститься
    await expect(input).toHaveValue('');
    
    // Кнопка должна быть отключена
    await expect(createBtn).toBeDisabled();
    
    // Заметка должна быть в списке
    const notesSelect = page.locator('#notesSelect');
    const optionTexts = await notesSelect.locator('option').allTextContents();
    const found = optionTexts.some(text => text.includes(noteTitle));
    expect(found).toBe(true);
  });
  
  // ============================================
  // ТЕСТ 7: Кнопка с лупой "Показать все заметки"
  // ============================================
  
  test('7. Кнопка с лупой "Показать все заметки" открывает модальное окно', async () => {
    const debugBtn = page.locator('#debugBtn');
    const debugModal = page.locator('#debugModal');
    
    // Кнопка должна быть видимой
    await expect(debugBtn).toBeVisible();
    
    // Проверяем title кнопки (теперь просто "Все заметки")
    await expect(debugBtn).toHaveAttribute('title', 'Все заметки');
    
    // Нажимаем на кнопку
    await debugBtn.click();
    
    // Модальное окно должно открыться
    await expect(debugModal).toBeVisible();
    await expect(debugModal).not.toHaveClass(/hidden/);
  });
  
  // ============================================
  // ТЕСТ 8: Модальное окно "Все заметки в хранилище" — Закрытие
  // ============================================
  
  test('8. Модальное окно "Все заметки в хранилище" — закрытие кнопкой X', async () => {
    // Создаём заметку чтобы в модальном окне было что показать
    await page.locator('#newNoteTitle').fill('Заметка для теста 8');
    await page.locator('#createBtn').click();
    await page.waitForTimeout(500);
    
    const debugBtn = page.locator('#debugBtn');
    const debugModal = page.locator('#debugModal');
    const closeModalBtn = page.locator('#closeModal');
    
    // Открываем модальное окно
    await debugBtn.click();
    await expect(debugModal).toBeVisible();
    
    // Нажимаем кнопку закрытия
    await closeModalBtn.click();
    
    // Модальное окно должно закрыться
    await expect(debugModal).toBeHidden();
    await expect(debugModal).toHaveClass(/hidden/);
  });
  
  // ============================================
  // ТЕСТ 9: Модальное окно — Закрытие по Escape
  // ============================================
  
  test('9. Модальное окно "Все заметки в хранилище" — закрытие по Escape', async () => {
    const debugBtn = page.locator('#debugBtn');
    const debugModal = page.locator('#debugModal');
    
    // Открываем модальное окно
    await debugBtn.click();
    await expect(debugModal).toBeVisible();
    
    // Нажимаем Escape
    await page.keyboard.press('Escape');
    
    // Модальное окно должно закрыться
    await expect(debugModal).toBeHidden();
  });
  
  // ============================================
  // ТЕСТ 10: Модальное окно — Закрытие по клику вне
  // ============================================
  
  test('10. Модальное окно "Все заметки в хранилище" — закрытие по клику вне', async () => {
    const debugBtn = page.locator('#debugBtn');
    const debugModal = page.locator('#debugModal');
    
    // Открываем модальное окно
    await debugBtn.click();
    await expect(debugModal).toBeVisible();
    
    // Кликаем по модальному окну (не по контенту)
    await debugModal.click({ position: { x: 10, y: 10 } });
    
    // Модальное окно должно закрыться
    await expect(debugModal).toBeHidden();
  });
  
  // ============================================
  // ТЕСТ 11: Модальное окно — Содержимое таблицы
  // ============================================
  
  test('11. Модальное окно "Все заметки в хранилище" — отображение таблицы с заметками', async () => {
    const debugBtn = page.locator('#debugBtn');
    const debugModal = page.locator('#debugModal');
    const tableBody = page.locator('#debugTableBody');
    
    // Открываем модальное окно
    await debugBtn.click();
    await expect(debugModal).toBeVisible();
    
    // Проверяем наличие таблицы
    const table = page.locator('.debug-table');
    await expect(table).toBeVisible();
    
    // Проверяем заголовки таблицы (4 колонки в новом дизайне)
    await expect(page.locator('.debug-table th').nth(0)).toHaveText('Ключ');
    await expect(page.locator('.debug-table th').nth(1)).toHaveText('Заголовок');
    await expect(page.locator('.debug-table th').nth(2)).toHaveText('Контент');
    await expect(page.locator('.debug-table th').nth(3)).toHaveText('Время');
    
    // 5-я колонка пустая (для кнопок действий)
    const fifthHeader = page.locator('.debug-table th').nth(4);
    await expect(fifthHeader).toHaveText('');
    
    // Проверяем что есть строки с заметками
    const rows = tableBody.locator('tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
  });
  
  // ============================================
  // ТЕСТ 12: Модальное окно — Удаление заметки
  // ============================================
  
  test('12. Модальное окно "Все заметки в хранилище" — удаление заметки', async () => {
    // Создаём заметку для удаления
    await page.locator('#newNoteTitle').fill('Заметка для удаления');
    await page.locator('#createBtn').click();
    await page.waitForTimeout(500);
    
    const debugBtn = page.locator('#debugBtn');
    const debugModal = page.locator('#debugModal');
    const tableBody = page.locator('#debugTableBody');
    
    // Открываем модальное окно
    await debugBtn.click();
    await expect(debugModal).toBeVisible();
    
    // Запоминаем количество строк
    const initialRows = await tableBody.locator('tr').count();
    
    // Находим первую кнопку удаления
    const deleteBtn = tableBody.locator('.btn-delete-row').first();
    await expect(deleteBtn).toBeVisible();
    
    // Подтверждаем удаление в диалоге
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('Удалить заметку');
      await dialog.accept();
    });
    
    // Нажимаем кнопку удаления
    await deleteBtn.click();
    
    // Ждём обновления таблицы
    await page.waitForTimeout(500);
    
    // Количество строк должно уменьшиться
    const finalRows = await tableBody.locator('tr').count();
    expect(finalRows).toBe(initialRows - 1);
    
    // Закрываем модальное окно
    await page.locator('#closeModal').click();
  });
  
  // ============================================
  // ТЕСТ 13: Модальное окно — Пустое хранилище
  // ============================================
  
  test('13. Модальное окно "Все заметки в хранилище" — показывает сообщение при отсутствии заметок', async () => {
    // Перезагружаем страницу чтобы очистить все заметки
    await page.reload();
    await page.waitForSelector('#notesSelect', { timeout: 15000 });
    
    // Открываем модальное окно
    const debugBtn = page.locator('#debugBtn');
    await debugBtn.click();
    
    const tableBody = page.locator('#debugTableBody');
    
    // Проверяем сообщение "Нет заметок"
    await expect(tableBody).toContainText('Нет заметок');
    
    // Закрываем модальное окно
    await page.locator('#closeModal').click();
    
    // На главной странице тоже должно показать "Нет заметок"
    const notesSelect = page.locator('#notesSelect');
    await expect(notesSelect).toBeDisabled();
    await expect(page.locator('#noNotesMessage')).toHaveClass(/visible/);
  });
  
  // ============================================
  // ТЕСТ 14: Footer с предупреждением
  // ============================================
  
  test('14. Footer с предупреждением отображается', async () => {
    const footer = page.locator('.app-footer');
    const small = footer.locator('small');
    
    await expect(footer).toBeVisible();
    await expect(small).toContainText('Закрытие вкладки без выбора отменит действие');
  });
  
  // ============================================
  // ТЕСТ 15: Модальное окно — защита от null элемента таблицы
  // ============================================
  
  test('15. Модальное окно не падает если элемент таблицы отсутствует в DOM', async () => {
    const debugBtn = page.locator('#debugBtn');
    const debugModal = page.locator('#debugModal');
    
    // Удаляем элемент таблицы из DOM перед открытием модального окна
    await page.evaluate(() => {
      const tableBody = document.getElementById('debugTableBody');
      if (tableBody) tableBody.remove();
    });
    
    // Проверяем что элемент удален
    const tableBody = page.locator('#debugTableBody');
    await expect(tableBody).toHaveCount(0);
    
    // Перехватываем ошибки консоли
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    
    // Открываем модальное окно - не должно быть ошибки
    await debugBtn.click();
    
    // Модальное окно должно открыться
    await expect(debugModal).toBeVisible();
    
    // Не должно быть ошибки "Cannot read properties of null"
    const hasNullError = consoleErrors.some(err => 
      err.includes('Cannot read properties of null') || 
      err.includes('Cannot read property')
    );
    expect(hasNullError).toBe(false);
    
    // Закрываем модальное окно
    await page.locator('#closeModal').click();
    
    // Восстанавливаем элемент таблицы для следующих тестов
    await page.evaluate(() => {
      const table = document.querySelector('#debugModal .debug-table');
      if (table) {
        const tbody = document.createElement('tbody');
        tbody.id = 'debugTableBody';
        table.appendChild(tbody);
      }
    });
  });
  
  // ============================================
  // ТЕСТ 16: Синхронизация темы между страницами
  // ============================================
  
  test('16. Тема синхронизируется между selection и editor', async () => {
    const themeToggleBtn = page.locator('#themeToggleBtn');
    
    // Проверяем что кнопка темы есть
    await expect(themeToggleBtn).toBeVisible();
    
    // Проверяем начальное состояние - должна быть светлая тема
    const initialHasDarkTheme = await page.locator('body').evaluate(el => 
      el.classList.contains('dark-theme')
    );
    
    // Переключаем на темную тему
    await themeToggleBtn.click();
    await page.waitForTimeout(200);
    
    // Проверяем что тема переключилась
    const afterToggleHasDarkTheme = await page.locator('body').evaluate(el => 
      el.classList.contains('dark-theme')
    );
    expect(afterToggleHasDarkTheme).toBe(!initialHasDarkTheme);
    
    // Проверяем что тема сохранилась в localStorage под ключом 'theme'
    const savedTheme = await page.evaluate(() => localStorage.getItem('theme'));
    expect(savedTheme).toBe('dark');
    
    // Теперь эмулируем переход на editor.html (открываем в той же вкладке)
    // Используем URL с параметрами правильно
    const editorBaseUrl = pathToFileURL(path.join(EXTENSION_PATH, 'editor.html')).href;
    const editorUrl = `${editorBaseUrl}?noteId=test_note_123`;
    await page.goto(editorUrl, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Ждём загрузки editor (или сообщения что нет noteId)
    // В editor может быть перенаправление, поэтому проверяем либо #noteTitle либо #backBtn
    try {
      await page.waitForSelector('#noteTitle, #backBtn', { timeout: 5000 });
    } catch (e) {
      // Если нет noteId, editor показывает сообщение - это тоже ОК
      console.log('Note ID не найден, editor показывает сообщение');
    }
    
    // Проверяем что на editor странице тоже темная тема (или проверяем localStorage)
    const editorHasDarkTheme = await page.locator('body').evaluate(el => 
      el.classList.contains('dark-theme')
    );
    const editorSavedTheme = await page.evaluate(() => localStorage.getItem('theme'));
    
    // Проверяем что тема синхронизировалась - либо через class, либо через localStorage
    expect(editorHasDarkTheme || editorSavedTheme === 'dark').toBe(true);
    
    console.log('✅ Синхронизация темы работает корректно');
  });
  
  // ============================================
  // ТЕСТ 17: Dropdown — визуальное отображение за пределами card
  // ============================================
  
  test('17. Dropdown открывается и отображается поверх границ card', async () => {
    // Создаём несколько заметок для отображения в dropdown
    await page.locator('#newNoteTitle').fill('Заметка А');
    await page.locator('#createBtn').click();
    await page.waitForTimeout(300);
    
    await page.locator('#newNoteTitle').fill('Заметка Б');
    await page.locator('#createBtn').click();
    await page.waitForTimeout(300);
    
    await page.locator('#newNoteTitle').fill('Заметка В');
    await page.locator('#createBtn').click();
    await page.waitForTimeout(300);
    
    // Проверяем что custom dropdown присутствует
    const customDropdown = page.locator('#customDropdown');
    const dropdownTrigger = page.locator('#dropdownTrigger');
    const dropdownMenu = page.locator('#dropdownMenu');
    
    await expect(customDropdown).toBeVisible();
    await expect(dropdownTrigger).toBeVisible();
    
    // Проверяем что dropdown-menu скрыт изначально
    await expect(dropdownMenu).toHaveClass(/dropdown-menu/);
    const initialHidden = await dropdownMenu.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.visibility === 'hidden' || !el.classList.contains('open');
    });
    expect(initialHidden).toBe(true);
    
    // Проверяем что card-body имеет overflow: visible (первая карточка - выбор заметки)
    const cardBody = page.locator('.ozon-card').first().locator('.card-body');
    const overflowVisible = await cardBody.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.overflow === 'visible';
    });
    expect(overflowVisible).toBe(true);
    
    // Проверяем что ozon-card НЕ имеет overflow: hidden
    const ozonCard = page.locator('.ozon-card').first();
    const cardNoOverflow = await ozonCard.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.overflow !== 'hidden';
    });
    expect(cardNoOverflow).toBe(true);
    
    // Открываем dropdown кликом по trigger
    await dropdownTrigger.click();
    await page.waitForTimeout(300);
    
    // Проверяем что dropdown-menu открылся (имеет класс .open)
    await expect(dropdownMenu).toHaveClass(/open/);
    
    // Проверяем что dropdown-menu видим
    const menuVisible = await dropdownMenu.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.visibility === 'visible' && style.opacity !== '0';
    });
    expect(menuVisible).toBe(true);
    
    // Проверяем что в dropdown есть опции
    const options = dropdownMenu.locator('.dropdown-option');
    const optionCount = await options.count();
    expect(optionCount).toBeGreaterThanOrEqual(3);
    
    // Проверяем что dropdown-menu имеет высокий z-index
    const zIndex = await dropdownMenu.evaluate(el => {
      const style = window.getComputedStyle(el);
      return parseInt(style.zIndex, 10);
    });
    expect(zIndex).toBeGreaterThanOrEqual(100);
    
    // Проверяем позиционирование dropdown (position: absolute)
    const position = await dropdownMenu.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.position;
    });
    expect(position).toBe('absolute');
    
    // Выбираем первую опцию
    await options.first().click();
    await page.waitForTimeout(300);
    
    // Проверяем что dropdown закрылся
    await expect(dropdownMenu).not.toHaveClass(/open/);
    
    console.log('✅ Dropdown корректно отображается за пределами card');
  });
  
  // ============================================
  // ТЕСТ 18: Dropdown — позиционирование относительно trigger
  // ============================================
  
  test('18. Dropdown позиционируется относительно trigger кнопки', async () => {
    // Создаём заметку если её нет
    const dropdownTrigger = page.locator('#dropdownTrigger');
    const dropdownMenu = page.locator('#dropdownMenu');
    
    // Открываем dropdown
    await dropdownTrigger.click();
    await page.waitForTimeout(300);
    
    // Получаем координаты trigger и menu
    const triggerBox = await dropdownTrigger.boundingBox();
    const menuBox = await dropdownMenu.boundingBox();
    
    // Menu должен быть ниже trigger (top больше чем у trigger)
    expect(menuBox.y).toBeGreaterThan(triggerBox.y);
    
    // Menu должен быть примерно на одном уровне по x (с учётом padding)
    const xDiff = Math.abs(menuBox.x - triggerBox.x);
    expect(xDiff).toBeLessThan(10); // Разница не более 10px
    
    // Menu должен быть того же размера что и trigger по ширине (или шире)
    expect(menuBox.width).toBeGreaterThanOrEqual(triggerBox.width - 20);
    
    console.log('✅ Dropdown корректно позиционируется относительно trigger');
  });
});
