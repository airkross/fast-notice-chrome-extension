/**
 * editor.js — Логика редактора (v3.2.2)
 * Интеграция с TextEditor компонентом
 * Дизайн в стиле Ozon Tech
 */

const STORAGE_KEY_PREFIX = 'note_';
const DEBOUNCE_DELAY = 400;
const SAVE_STATUS = {
  READY: 'Готово',
  SAVING: 'Сохранение...',
  SAVED: 'Сохранено'
};

let currentNoteId = null;
let storageKey = null;
let saveDebounceTimer = null;
let isLoadingNote = false;
let lastSavedTitle = '';
let pellEditor = null;

const noteTitleInput = document.getElementById('noteTitle');
const notesSelect = document.getElementById('notesList');
const saveStatusEl = document.getElementById('saveStatus');
const deleteBtn = document.getElementById('deleteNote');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const backBtn = document.getElementById('backBtn');

// Тема
let isDarkTheme = false;
// Используем единый ключ 'theme' для синхронизации между всеми страницами
const THEME_STORAGE_KEY = 'theme';

/**
 * Форматирует массив вкладок в HTML для вставки в редактор
 * @param {Array<{url: string, title: string, favIconUrl: string}>} tabs
 * @returns {string} HTML строка
 */
function formatTabsAsHtml(tabs) {
  if (!tabs || tabs.length === 0) {
    return '';
  }

  const headerHtml = '<h2>🔗 Вкладки</h2>';
  const listItems = tabs.map(tab => {
    // Экранируем title для безопасности (XSS protection)
    const safeTitle = (tab.title || 'Без названия')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');

    const safeUrl = (tab.url || '#')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    return `<li><a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeTitle}</a> 🔗</li>`;
  }).join('');

  return `${headerHtml}<ul>${listItems}</ul>`;
}

function getNoteIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('noteId');
}

function sendToBackground(type, payload = {}) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        const isJestMock = lastError.message === 'Error message' &&
                          (typeof chrome.runtime.sendMessage.mock !== 'undefined' ||
                           typeof jest !== 'undefined');
        const isMessagePortClosed = lastError.message &&
          lastError.message.includes('message port closed');

        // При "message port closed" возвращаем пустой объект вместо ошибки
        // Это позволяет обработать случай без alert
        if (isMessagePortClosed || isJestMock) {
          resolve({});
          return;
        }

        // Для других ошибок логируем, но возвращаем пустой объект
        console.warn('[Editor] Ошибка sendMessage:', lastError.message);
        resolve({});
        return;
      }
      resolve(response);
    });
  });
}

/**
 * Проверяет группу вкладок напрямую через Chrome API (доступен на странице расширения)
 * @returns {Promise<{inGroup: boolean, groupId?: number, groupTitle?: string, otherGroupTabsCount: number, totalTabs: number, hasOtherTabs: boolean, success: boolean}>}
 */
async function checkTabGroup() {
  try {
    console.log('[Editor] Проверяем группу вкладок через chrome.tabs.query...');

    // Получаем ВСЕ вкладки текущего окна (включая НЕактивные)
    const allTabs = await chrome.tabs.query({ currentWindow: true });
    console.log('[Editor] Всего вкладок в окне:', allTabs.length);

    // Также получаем активную вкладку - она должна быть в правильной группе
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    console.log('[Editor] Активная вкладка:', activeTab?.id, activeTab?.url, 'groupId:', activeTab?.groupId);

    // Находим вкладку редактора по URL
    const editorTab = allTabs.find(t => t.url && t.url === activeTab?.url);

    if (!editorTab) {
      return {
        success: true,
        inGroup: false,
        hasOtherTabs: allTabs.length > 0,
        totalTabs: allTabs.length,
        otherGroupTabsCount: 0
      };
    }

    console.log('[Editor] Найдена вкладка редактора:', editorTab.id, editorTab.url);
    console.log('[Editor] groupId редактора из tabs.query:', editorTab.groupId);

    // Если редактор - активная вкладка, используем его groupId
    // Если нет - используем groupId активной вкладки (это обход бага Chrome)
    let editorGroupId = editorTab.groupId;

    // Проверяем: если groupId редактора отличается от активной вкладки,
    // используем groupId активной вкладки (это обход бага Chrome)
    if (activeTab && editorTab.id === activeTab.id) {
      console.log('[Editor] Редактор - активная вкладка, используем его groupId');
    } else if (activeTab && activeTab.groupId && activeTab.groupId !== -1) {
      console.log('[Editor] ВНИМАНИЕ: groupId редактора отличается от активной вкладки!');
      console.log('[Editor] Редактор groupId:', editorTab.groupId, 'Активная вкладка groupId:', activeTab.groupId);
      console.log('[Editor] Используем groupId активной вкладки как обход бага Chrome');
      editorGroupId = activeTab.groupId;
    }

    // Проверяем, находится ли редактор в группе (groupId !== -1 означает что вкладка в группе)
    if (editorGroupId && editorGroupId !== -1) {
      console.log('[Editor] Редактор в группе с groupId:', editorGroupId);

      // Пробуем получить название группы через chrome.tabGroups.get
      let groupTitle = 'Безымянная группа';
      if (typeof chrome !== 'undefined' && chrome.tabGroups && typeof chrome.tabGroups.get === 'function') {
        try {
          const group = await chrome.tabGroups.get(editorGroupId);
          console.log('[Editor] Получена информация о группе:', group);
          if (group && group.title) {
            groupTitle = group.title;
          }
        } catch (groupErr) {
          console.warn('[Editor] Ошибка получения группы через chrome.tabGroups.get:', groupErr);
        }
      } else {
        console.log('[Editor] chrome.tabGroups недоступен, используем groupId напрямую');
      }

      // Получаем все вкладки в этой группе через chrome.tabs.query с groupId
      const groupTabs = await chrome.tabs.query({ groupId: editorGroupId });

      console.log('[Editor] Вкладки В ГРУППЕ (до фильтрации):', groupTabs.length);
      console.log('[Editor] IDs ВСЕХ вкладок в группе:', groupTabs.map(t => `${t.id}:${t.title?.slice(0,30)}`).join(' | '));
      console.log('[Editor] ID редактора (editorTab.id):', editorTab.id);

      // Фильтруем - исключаем редактор по URL (более надёжно чем по id)
      const otherGroupTabs = groupTabs.filter(t => !t.url || !t.url.includes('editor.html'));

      console.log('[Editor] Вкладки в группе (после фильтрации):', groupTabs.length, 'другие:', otherGroupTabs.length);
      console.log('[Editor] IDs отфильтрованных вкладок:', otherGroupTabs.map(t => `${t.id}:${t.title?.slice(0,30)}`).join(' | '));

      return {
        success: true,
        inGroup: true,
        groupId: editorGroupId,
        groupTitle: groupTitle,
        groupTabsCount: groupTabs.length,
        otherGroupTabsCount: otherGroupTabs.length,
        // hasOtherTabs показывает есть ли ВООБЩЕ другие вкладки (кроме редактора)
        // Независимо от того, в группе они или нет
        hasOtherTabs: otherGroupTabs.length > 0,
        totalTabs: allTabs.length
      };
    }

    // Редактор НЕ в группе (groupId === -1)
    // Подсчитываем вкладки без группы (groupId === -1)
    const ungroupedTabs = allTabs.filter(t => t.id !== editorTab.id && t.groupId === -1);
    console.log('[Editor] Редактор не в группе. Негрупппированных вкладок:', ungroupedTabs.length);

    return {
      success: true,
      inGroup: false,
      // Используем ungroupedTabsCount для правильного определения доступных вкладок
      hasOtherTabs: ungroupedTabs.length > 0,
      totalTabs: allTabs.length,
      otherGroupTabsCount: 0,
      ungroupedTabsCount: ungroupedTabs.length
    };
  } catch (err) {
    console.error('[Editor] Ошибка проверки группы вкладок:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Собирает вкладки на основе выбора пользователя
 * @param {boolean} collectFromGroup - если true, собирает из группы редактора; если false - собирает негрупппированные вкладки
 * @param {number} [editorGroupId] - ID группы редактора (если известен)
 * @returns {Promise<{tabs: Array, fromGroup: boolean, success: boolean}>}
 */
async function collectTabs(collectFromGroup, editorGroupId) {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const editorTab = tabs.find(t => t.url && t.url.includes('editor.html'));

    if (!editorTab) {
      // Редактор не найден - собираем все вкладки
      const otherTabs = tabs.filter(t => t.url && !t.url.includes('editor.html'));
      const tabData = otherTabs.map(tab => ({
        url: tab.url,
        title: tab.title || 'Без названия',
        favIconUrl: tab.favIconUrl || ''
      }));
      return { success: true, tabs: tabData, fromGroup: false };
    }

    // Определяем groupId для сбора
    const targetGroupId = editorGroupId || editorTab.groupId;
    console.log(`[collectTabs] ВХОДНЫЕ: collectFromGroup=${collectFromGroup}, editorGroupId=${editorGroupId}, editorTab.groupId=${editorTab.groupId}, targetGroupId=${targetGroupId}`);

    if (collectFromGroup && targetGroupId && targetGroupId !== -1) {
      // Собираем ТОЛЬКО вкладки ИЗ ГРУППЫ редактора
      const groupTabs = await chrome.tabs.query({ groupId: targetGroupId });

      console.log(`[collectTabs] Вкладки в группе ${targetGroupId}:`, groupTabs.length);
      console.log('[collectTabs] IDs ВСЕХ вкладок в группе:', groupTabs.map(t => `${t.id}:${t.title?.slice(0,20)}`).join(' | '));

      // Фильтруем - исключаем редактор по URL (более надёжно чем по id)
      // Потому что Chrome может присвоить вкладке редактора РАЗНЫЙ ID внутри группы
      const otherGroupTabs = groupTabs.filter(t => !t.url || !t.url.includes('editor.html'));

      console.log('[collectTabs] IDs отфильтрованных вкладок:', otherGroupTabs.map(t => `${t.id}:${t.title?.slice(0,20)}`).join(' | '));

      const tabData = otherGroupTabs.map(tab => ({
        url: tab.url,
        title: tab.title || 'Без названия',
        favIconUrl: tab.favIconUrl || ''
      }));

      console.log(`[Editor] Собрано из группы ${targetGroupId}: ${tabData.length} вкладок`);
      return { success: true, tabs: tabData, fromGroup: true };
    } else {
      // Собираем только НЕГРУППИРОВАННЫЕ вкладки (groupId === -1)
      // Исключаем сам редактор
      const ungroupedTabs = tabs.filter(t =>
        t.id !== editorTab.id &&
        t.groupId === -1 &&
        t.url &&
        !t.url.includes('editor.html')
      );

      const tabData = ungroupedTabs.map(tab => ({
        url: tab.url,
        title: tab.title || 'Без названия',
        favIconUrl: tab.favIconUrl || ''
      }));

      console.log(`[Editor] Собрано негрупппированных вкладок: ${tabData.length}`);
      return { success: true, tabs: tabData, fromGroup: false };
    }
  } catch (err) {
    console.error('[Editor] Ошибка сбора вкладок:', err);
    return { success: false, error: err.message, tabs: [] };
  }
}

function updateSaveStatus(status) {
  if (!saveStatusEl) return;
  saveStatusEl.textContent = status;
  saveStatusEl.className = 'status-indicator';

  if (status === SAVE_STATUS.SAVING) {
    saveStatusEl.classList.add('saving');
  } else if (status === SAVE_STATUS.SAVED) {
    saveStatusEl.classList.add('saved');
    setTimeout(() => {
      if (saveStatusEl.textContent === SAVE_STATUS.SAVED) {
        saveStatusEl.textContent = SAVE_STATUS.READY;
        saveStatusEl.className = 'status-indicator';
      }
    }, 1500);
  } else if (status === 'Ошибка') {
    saveStatusEl.classList.add('error');
  }
}

async function saveCurrentNote() {
  if (!storageKey || !currentNoteId) return;

  const content = pellEditor ? pellEditor.content.innerHTML : '';
  const title = noteTitleInput.value.trim();

  try {
    updateSaveStatus(SAVE_STATUS.SAVING);

    await sendToBackground('SAVE_NOTE', {
      noteId: currentNoteId,
      data: {
        content,
        title,
        timestamp: Date.now()
      }
    });

    lastSavedTitle = title;

    // Обновляем список заметок в селекте
    await refreshNotesList();
    if (notesSelect) notesSelect.value = currentNoteId;

    updateSaveStatus(SAVE_STATUS.SAVED);
    console.log(`[Editor] Сохранено: ${storageKey}`);
  } catch (err) {
    console.warn('[Editor] Ошибка сохранения:', err);
    updateSaveStatus(SAVE_STATUS.READY);
  }
}

function debouncedSave() {
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(saveCurrentNote, DEBOUNCE_DELAY);
}

async function loadNoteById(noteId) {
  if (!noteId || isLoadingNote) return;

  isLoadingNote = true;
  updateSaveStatus('Загрузка...');

  try {
    await saveCurrentNote();

    const note = await sendToBackground('GET_NOTE', { noteId });

    if (note) {
      currentNoteId = noteId;
      storageKey = `${STORAGE_KEY_PREFIX}${noteId}`;

      noteTitleInput.value = note.title || '';
      lastSavedTitle = note.title || '';

      if (pellEditor) {
        pellEditor.content.innerHTML = note.content || '';
      }

      const newUrl = `${window.location.pathname}?noteId=${noteId}`;
      window.history.replaceState({}, '', newUrl);

      // Обновляем Select после загрузки заметки
      if (notesSelect) notesSelect.value = currentNoteId;

      updateSaveStatus(SAVE_STATUS.READY);
      console.log(`[Editor] Загружена: ${noteId}`);
    }
  } catch (err) {
    console.warn('[Editor] Ошибка загрузки:', err);
    updateSaveStatus('Ошибка');
  } finally {
    isLoadingNote = false;
  }
}

async function deleteCurrentNote() {
  if (!currentNoteId) return;

  const content = pellEditor ? pellEditor.content.innerText : '';
  const title = noteTitleInput.value.trim() || '(без заголовка)';

  if (content) {
    const confirmed = confirm(
      `Удалить заметку "${title}"?\n\nПревью: ${content.slice(0, 120)}${content.length > 120 ? '...' : ''}`
    );
    if (!confirmed) return;
  }

  try {
    const response = await sendToBackground('DELETE_NOTE', { noteId: currentNoteId });

    if (response?.success) {
      await sendToBackground('OPEN_SELECTION');
      await sendToBackground('CLOSE_TAB');
    } else {
      alert('Не удалось удалить: ' + (response?.error || 'Неизвестная ошибка'));
    }
  } catch (err) {
    console.warn('[Editor] Ошибка удаления:', err);
    alert('Ошибка при удалении. Проверьте консоль.');
  }
}

/**
 * Показывает кастомный диалог с 3 кнопками для выбора источника вкладок
 * @param {string} groupTitle - название группы вкладок
 * @param {number} groupTabsCount - количество вкладок в группе
 * @param {number} totalTabs - всего вкладок в окне
 * @returns {Promise<'group'|'ungrouped'|'cancel'>} Выбор пользователя
 */
function showTabSourceDialog(groupTitle, groupTabsCount, totalTabs) {
  return new Promise((resolve) => {
    // Создаём overlay
    const overlay = document.createElement('div');
    overlay.id = 'tab-source-dialog-overlay';
    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: '10000',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    });

    // Создаём диалог
    const dialog = document.createElement('div');
    Object.assign(dialog.style, {
      backgroundColor: isDarkTheme ? '#1e1e1e' : '#ffffff',
      color: isDarkTheme ? '#e0e0e0' : '#333333',
      padding: '24px',
      borderRadius: '12px',
      maxWidth: '400px',
      width: '90%',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
    });

    // Заголовок
    const title = document.createElement('h3');
    title.textContent = '📋 Выберите источник вкладок';
    title.style.margin = '0 0 16px 0';
    title.style.fontSize = '18px';
    dialog.appendChild(title);

    // Описание
    const desc = document.createElement('p');
    desc.innerHTML = `
      Редактор находится в группе "<strong>${groupTitle}</strong>".<br><br>
      В группе <strong>${groupTabsCount}</strong> вкладок.<br>
      Всего в окне <strong>${totalTabs}</strong> вкладок.
    `;
    desc.style.margin = '0 0 20px 0';
    desc.style.lineHeight = '1.5';
    dialog.appendChild(desc);

    // Контейнер для кнопок
    const buttonsContainer = document.createElement('div');
    Object.assign(buttonsContainer.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    });

    // Кнопка 1: Из группы
    const btnGroup = document.createElement('button');
    btnGroup.textContent = `📁 Из группы "${groupTitle}"`;
    Object.assign(btnGroup.style, {
      padding: '12px 16px',
      fontSize: '14px',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      backgroundColor: '#005BFF',
      color: 'white',
      transition: 'background-color 0.2s'
    });
    btnGroup.onmouseover = () => btnGroup.style.backgroundColor = '#0044CC';
    btnGroup.onmouseout = () => btnGroup.style.backgroundColor = '#005BFF';
    btnGroup.onclick = () => {
      document.body.removeChild(overlay);
      resolve('group');
    };
    buttonsContainer.appendChild(btnGroup);

    // Кнопка 2: Негрупппированные
    const btnUngrouped = document.createElement('button');
    btnUngrouped.textContent = '📄 Негрупппированные вкладки';
    Object.assign(btnUngrouped.style, {
      padding: '12px 16px',
      fontSize: '14px',
      border: 'none',
      borderRadius: '8px',
      cursor: 'pointer',
      backgroundColor: isDarkTheme ? '#3a3a3a' : '#f0f0f0',
      color: isDarkTheme ? '#e0e0e0' : '#333333',
      transition: 'background-color 0.2s'
    });
    btnUngrouped.onmouseover = () => {
      btnUngrouped.style.backgroundColor = isDarkTheme ? '#4a4a4a' : '#e0e0e0';
    };
    btnUngrouped.onmouseout = () => {
      btnUngrouped.style.backgroundColor = isDarkTheme ? '#3a3a3a' : '#f0f0f0';
    };
    btnUngrouped.onclick = () => {
      document.body.removeChild(overlay);
      resolve('ungrouped');
    };
    buttonsContainer.appendChild(btnUngrouped);

    // Кнопка 3: Отмена
    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Отмена';
    Object.assign(btnCancel.style, {
      padding: '10px 16px',
      fontSize: '14px',
      border: '1px solid',
      borderColor: isDarkTheme ? '#555' : '#ccc',
      borderRadius: '8px',
      cursor: 'pointer',
      backgroundColor: 'transparent',
      color: isDarkTheme ? '#aaa' : '#666',
      transition: 'all 0.2s'
    });
    btnCancel.onmouseover = () => {
      btnCancel.style.backgroundColor = isDarkTheme ? '#2a2a2a' : '#f5f5f5';
    };
    btnCancel.onmouseout = () => {
      btnCancel.style.backgroundColor = 'transparent';
    };
    btnCancel.onclick = () => {
      document.body.removeChild(overlay);
      resolve('cancel');
    };
    buttonsContainer.appendChild(btnCancel);

    dialog.appendChild(buttonsContainer);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  });
}

// Обновление списка заметок в селекте
async function refreshNotesList() {
  if (!notesSelect) return;

  try {
    const notes = await sendToBackground('GET_NOTES_SUMMARY');

    const shouldHideSingleEmpty = notes.length === 1 && !notes[0].hasContent;

    notesSelect.innerHTML = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = '📋 Выбрать заметку...';
    notesSelect.appendChild(placeholder);

    if (!shouldHideSingleEmpty) {
      notes.forEach(note => {
        const displayName = (note.title && note.title.trim()) ? note.title.trim() : note.key;

        const option = document.createElement('option');
        option.value = note.id;
        option.textContent = displayName;
        option.dataset.key = note.key;
        notesSelect.appendChild(option);
      });
    }

    // Устанавливаем текущую заметку как выбранную
    if (notes.some(n => n.id === currentNoteId)) {
      notesSelect.value = currentNoteId;
    }

  } catch (err) {
    console.warn('[Editor] Ошибка обновления списка:', err);
    notesSelect.innerHTML = '<option value="" disabled selected>📋 Ошибка загрузки...</option>';
  }
}

// Обновление состояния кнопок тулбара
function updateToolbarButtonStates() {
  const formatCommands = ['bold', 'italic', 'underline', 'strikeThrough'];

  formatCommands.forEach(cmd => {
    const btn = document.querySelector(`.pell-button[data-command="${cmd}"]`);
    if (btn) {
      try {
        if (document.queryCommandState(cmd)) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      } catch (e) {
        btn.classList.remove('active');
      }
    }
  });

  const linkBtn = document.getElementById('linkBtn');
  if (linkBtn) {
    try {
      const selection = window.getSelection();
      if (selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const parentElement = container.nodeType === Node.TEXT_NODE
          ? container.parentElement
          : container;

        const isInLink = parentElement && parentElement.closest('a');

        if (isInLink) {
          linkBtn.classList.add('active');
        } else {
          linkBtn.classList.remove('active');
        }
      }
    } catch (e) {
      linkBtn.classList.remove('active');
    }
  }
}

// Обработчики кнопок тулбара
function setupToolbarHandlers() {
  const editor = document.getElementById('textEditor');
  const headingSelect = document.getElementById('headingSelect');

  let savedSelection = null;
  function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      savedSelection = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    if (savedSelection && editor) {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedSelection);
    }
  }

  // Удаляем старые обработчики
  document.querySelectorAll('[data-command]').forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });

  // Назначаем новые обработчики
  document.querySelectorAll('[data-command]').forEach(btn => {
    btn.addEventListener('mousedown', (e) => {
      saveSelection();
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      restoreSelection();

      if (editor) {
        editor.focus();
        restoreSelection();
      }

      const command = btn.dataset.command;
      console.log('[Toolbar] Команда:', command);

      let result = false;
      switch (command) {
        case 'bold':
          result = document.execCommand('bold', false, null);
          break;
        case 'italic':
          result = document.execCommand('italic', false, null);
          break;
        case 'underline':
          result = document.execCommand('underline', false, null);
          break;
        case 'strikeThrough':
          result = document.execCommand('strikeThrough', false, null);
          break;
        case 'insertOrderedList':
          result = document.execCommand('insertOrderedList', false, null);
          break;
        case 'insertUnorderedList':
          result = document.execCommand('insertUnorderedList', false, null);
          break;
        case 'link':
          const selection = window.getSelection();
          let existingUrl = 'https://';

          if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            const container = range.commonAncestorContainer;
            const parentElement = container.nodeType === Node.TEXT_NODE
              ? container.parentElement
              : container;

            const linkElement = parentElement?.closest('a');
            if (linkElement && linkElement.href) {
              existingUrl = linkElement.href;
            }
          }

          if (window.textEditorInstance && typeof window.textEditorInstance.insertLinkWithPrompt === 'function') {
            window.textEditorInstance.insertLinkWithPrompt(existingUrl);
          } else {
            const url = prompt('Введите URL ссылки:', existingUrl);
            if (url && url !== 'https://') {
              result = document.execCommand('createLink', false, url);
            }
          }
          break;
        case 'collectTabs':
          // Сбор вкладок текущего окна
          // Используем прямые вызовы Chrome API вместо background.js
          // потому что chrome.tabGroups недоступен в service worker
          (async () => {
            try {
              updateSaveStatus('Сбор вкладок...');

              // Сначала получаем информацию о группе вкладок напрямую
              console.log('[Editor] Запрос информации о группе вкладок...');
              const groupInfo = await checkTabGroup();//
              console.log('[Editor] Информация о группе:', groupInfo);

              // Определяем откуда собирать вкладки
              let collectFromGroup = false;
              let sourceDescription = 'негрупппированные вкладки';

              // Проверяем на ошибки
              if (!groupInfo?.success) {
                console.warn('[Editor] Ошибка получения информации о группах:', groupInfo?.error);
                updateSaveStatus('Не удалось собрать вкладки. Проверьте расширение.');
                return;
              }

              // Если редактор В ГРУППЕ - показываем диалог с 3 кнопками
              if (groupInfo?.inGroup && groupInfo?.otherGroupTabsCount > 0) {
                const choice = await showTabSourceDialog(
                  groupInfo.groupTitle,
                  groupInfo.otherGroupTabsCount,
                  groupInfo.totalTabs
                );

                // Обрабатываем выбор пользователя
                if (choice === 'cancel') {
                  console.log('[Editor] Пользователь отменил сбор вкладок');
                  updateSaveStatus('Отменено');
                  return;
                }

                collectFromGroup = (choice === 'group');
                sourceDescription = choice === 'group'
                  ? `группу "${groupInfo.groupTitle}"`
                  : 'негрупппированные вкладки';
              } else if (!groupInfo?.inGroup) {
                // Редактор НЕ в группе - собираем негрупппированные вкладки автоматически
                if (!groupInfo?.hasOtherTabs) {
                  console.log('[Editor] Нет негрупппированных вкладок для сбора');
                  updateSaveStatus('Нет вкладок для сбора');
                  return;
                }
                collectFromGroup = false;
                sourceDescription = 'негрупппированные вкладки';
              } else if (!groupInfo?.hasOtherTabs) {
                console.log('[Editor] Нет вкладок для сбора');
                updateSaveStatus('Нет других вкладок');
                return;
              }

              console.log(`[Editor] Сбор вкладок из: ${sourceDescription}...`);
              console.log(`[Editor] ПАРАМЕТРЫ: collectFromGroup=${collectFromGroup}, groupId=${groupInfo?.groupId}`);

              // Собираем вкладки с учётом выбора пользователя
              const response = await collectTabs(collectFromGroup, groupInfo?.groupId);
              console.log('[Editor] Получен ответ:', response);

              // Если ответ пустой или ошибка
              if (!response || !response.success) {
                const errorMsg = response?.error || 'Не удалось собрать вкладки.';
                console.warn('[Editor] Не удалось собрать вкладки:', errorMsg);
                updateSaveStatus('Не удалось собрать вкладки.');
                return;
              }

              // Если вкладок нет - показываем информационное сообщение
              if (!response.tabs || response.tabs.length === 0) {
                console.log('[Editor] Нет вкладок для сбора');
                updateSaveStatus('Нет вкладок для сбора');
                return;
              }

              // Успешный случай - добавляем вкладки
              const tabsHtml = formatTabsAsHtml(response.tabs);

              if (pellEditor && pellEditor.content) {
                // Вставляем HTML в редактор
                pellEditor.content.focus();

                // Добавляем перенос строки перед списком, если контент не пустой
                const currentContent = pellEditor.content.innerHTML.trim();
                const separator = currentContent ? '<br><br>' : '';
                pellEditor.content.innerHTML = currentContent + separator + tabsHtml;

                const fromGroupText = response.fromGroup ? ' из группы' : '';
                console.log(`[Editor] Добавлено ${response.tabs.length} вкладок${fromGroupText}`);
                debouncedSave();
                updateSaveStatus(`Добавлено ${response.tabs.length} ссылок`);
              }
            } catch (err) {
              console.error('[Editor] Исключение при сборе вкладок:', err);
              updateSaveStatus('Ошибка при сборе вкладок');
            }
          })();
          return; // Не вызываем debouncedSave() здесь, так как он вызывается асинхронно
      }

      console.log('[Toolbar] Результат execCommand:', result);
      debouncedSave();

      setTimeout(() => updateToolbarButtonStates(), 10);
    });
  });

  if (headingSelect) {
    headingSelect.addEventListener('change', (e) => {
      if (editor) editor.focus();
      const tag = e.target.value;
      document.execCommand('formatBlock', false, tag);
      debouncedSave();
    });
  }
}

// Управление темой
function toggleTheme() {
  isDarkTheme = !isDarkTheme;

  if (isDarkTheme) {
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
  } else {
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
  }

  console.log('[Theme] Переключено на:', isDarkTheme ? 'тёмную' : 'светлую', 'тему');
}

function loadTheme() {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);

  if (savedTheme === 'dark') {
    isDarkTheme = true;
    document.body.classList.add('dark-theme');
    document.body.classList.remove('light-theme');
  } else if (savedTheme === 'light') {
    isDarkTheme = false;
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark-theme');
  } else {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      isDarkTheme = true;
      document.body.classList.add('dark-theme');
    } else {
      isDarkTheme = false;
      document.body.classList.add('light-theme');
    }
  }
}

function setupEventListeners() {
  noteTitleInput.addEventListener('input', () => {
    if (!isLoadingNote) debouncedSave();
  });

  // Обработчик выбора заметки из селекта
  if (notesSelect) {
    notesSelect.addEventListener('change', (e) => {
      const selectedId = e.target.value;
      if (selectedId && selectedId !== currentNoteId) {
        loadNoteById(selectedId);
      }
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveCurrentNote();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveCurrentNote();
    }
  });

  if (deleteBtn) deleteBtn.addEventListener('click', deleteCurrentNote);
  if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
  if (backBtn) backBtn.addEventListener('click', async () => {
    await saveCurrentNote();
    await sendToBackground('OPEN_SELECTION');
    await sendToBackground('CLOSE_TAB');
  });
}

async function init() {
  const urlNoteId = getNoteIdFromUrl();

  if (!urlNoteId) {
    console.log('[Editor] Нет noteId, закрываем вкладку');
    await sendToBackground('CLOSE_TAB');
    return;
  }

  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  if (!savedTheme) {
    isDarkTheme = false;
  }

  currentNoteId = urlNoteId;
  storageKey = `${STORAGE_KEY_PREFIX}${currentNoteId}`;

  const pellElement = document.getElementById('pellEditor');
  const existingTextEditor = document.getElementById('textEditor');

  if (pellElement && typeof pell === 'object') {
    if (existingTextEditor) {
      pellEditor = {
        content: existingTextEditor,
      };
    } else {
      pellEditor = pell.init({
        element: pellElement,
        onChange: (html) => {
          debouncedSave();
        },
        defaultParagraphSeparator: 'p',
        styleWithCSS: false,
        actions: [],
        classes: {
          editor: 'pell-content',
          toolbar: 'pell-toolbar',
          button: 'pell-button',
          buttonActive: 'pell-button-active',
          content: 'pell-content'
        }
      });

      if (pellEditor.content) {
        pellEditor.content.id = 'textEditor';
      }
    }
  }

  const existing = await sendToBackground('GET_NOTE', { noteId: currentNoteId });
  if (!existing) {
    await sendToBackground('SAVE_NOTE', {
      noteId: currentNoteId,
      data: { content: '', title: '', createdAt: Date.now() }
    });
  } else {
    noteTitleInput.value = existing.title || '';
    lastSavedTitle = existing.title || '';

    if (pellEditor) {
      pellEditor.content.innerHTML = existing.content || '';
    }
  }

  if (typeof TextEditor === 'function') {
    const editorElement = document.getElementById('textEditor');
    if (editorElement) {
      window.textEditorInstance = new TextEditor(editorElement, {
        format: 'html',
        onChange: (html) => {
          debouncedSave();
        },
        onFormatChange: (format) => {
          console.log('[Editor] Формат изменён:', format);
        }
      });
      console.log('[Editor] TextEditor инициализирован');
    }
  }

  setTimeout(() => {
    setupToolbarHandlers();

    const editor = document.getElementById('textEditor');
    if (editor) {
      editor.addEventListener('keyup', () => updateToolbarButtonStates());
      editor.addEventListener('mouseup', () => updateToolbarButtonStates());
      editor.addEventListener('click', () => updateToolbarButtonStates());
    }
  }, 100);

  loadTheme();

  setupEventListeners();

  // Загружаем список заметок в селект
  await refreshNotesList();
  if (notesSelect) notesSelect.value = currentNoteId;

  console.log('[Editor] Инициализировано. Note ID:', currentNoteId);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    toggleTheme,
    loadTheme,
    sendToBackground,
    refreshNotesList,
    formatTabsAsHtml,
    checkTabGroup,
    collectTabs,
    showTabSourceDialog,
    THEME_STORAGE_KEY,
  };
}
