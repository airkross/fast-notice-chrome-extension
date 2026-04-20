/**
 * background.js — фоновый скрипт расширения (Manifest V3)
 * v2.0.2: Исправлено создание заметки только после подтверждения навигации
 */

const STORAGE_KEY_PREFIX = 'note_';

/**
 * Открывает новую вкладку со страницей выбора заметки
 */
async function openSelectionTab() {
  try {
    await chrome.tabs.create({
      url: chrome.runtime.getURL('selection.html'),
      active: true
    });
    console.log('[Background] Открыта вкладка выбора заметки');
  } catch (err) {
    console.warn('[Background] Ошибка открытия вкладки:', err);
  }
}

/**
 * Создаёт новую заметку и открывает редактор в ТОЙ ЖЕ вкладке
 * ВАЖНО: заметка создаётся ТОЛЬКО после успешного обновления вкладки
 */
async function createNewNote(title, tabId) {
  try {
    const noteId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const key = `${STORAGE_KEY_PREFIX}${noteId}`;
    
    // ✅ Сначала обновляем вкладку (если пользователь отменит — заметка не создастся)
    if (tabId) {
      await chrome.tabs.update(tabId, {
        url: `${chrome.runtime.getURL('editor.html')}?noteId=${noteId}`
      });
    }
    
    // ✅ Только после успешного обновления создаём заметку в хранилище
    await chrome.storage.local.set({
      [key]: {
        content: '',
        title: title || '',
        timestamp: Date.now(),
        createdAt: Date.now()
      }
    });
    
    console.log('[Background] Создана заметка:', noteId);
    return { success: true, noteId };
  } catch (err) {
    console.warn('[Background] Ошибка создания заметки:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Открывает существующую заметку в редакторе в ТОЙ ЖЕ вкладке
 */
async function openExistingNote(noteId, tabId) {
  try {
    if (tabId) {
      await chrome.tabs.update(tabId, {
        url: `${chrome.runtime.getURL('editor.html')}?noteId=${noteId}`
      });
    }
    
    console.log('[Background] Открыта существующая заметка:', noteId);
    return { success: true };
  } catch (err) {
    console.warn('[Background] Ошибка открытия заметки:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Удаляет заметку по noteId
 */
async function deleteNoteById(noteId) {
  if (!noteId) return { success: false, error: 'No noteId provided' };
  
  const key = `${STORAGE_KEY_PREFIX}${noteId}`;
  try {
    const check = await chrome.storage.local.get([key]);
    if (!check[key]) {
      console.log(`[Background] Заметка ${key} уже удалена`);
      return { success: true, alreadyDeleted: true };
    }
    
    await chrome.storage.local.remove(key);
    
    const verify = await chrome.storage.local.get([key]);
    if (verify[key]) {
      throw new Error('Удаление не подтверждено');
    }
    
    console.log(`[Background] Заметка ${key} удалена`);
    return { success: true };
  } catch (err) {
    console.warn(`[Background] Ошибка при удалении ${key}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Возвращает сводку по всем заметкам
 */
async function getAllNotesSummary() {
  try {
    const all = await chrome.storage.local.get(null);
    const notes = [];
    
    Object.entries(all).forEach(([key, value]) => {
      if (key.startsWith(STORAGE_KEY_PREFIX) && value) {
        const noteId = key.replace(STORAGE_KEY_PREFIX, '');
        const title = value.title?.trim() || '';
        const preview = value.content
          ?.replace(/<[^>]*>/g, '')
          ?.replace(/\s+/g, ' ')
          ?.trim()
          ?.slice(0, 60) || '';
        
        notes.push({
          id: noteId,
          key: key,
          title: title,
          preview: preview + (preview.length >= 60 ? '...' : ''),
          timestamp: value.timestamp || 0,
          createdAt: value.createdAt || 0,
          hasContent: !!(value.content?.trim() || value.title?.trim())
        });
      }
    });
    
    return notes.sort((a, b) => b.timestamp - a.timestamp);
  } catch (err) {
    console.warn('[Background] Ошибка получения списка:', err);
    return [];
  }
}

/**
 * Получает полную заметку по noteId
 */
async function getNoteById(noteId) {
  if (!noteId) return null;
  const key = `${STORAGE_KEY_PREFIX}${noteId}`;
  try {
    const result = await chrome.storage.local.get([key]);
    return result[key] || null;
  } catch (err) {
    console.warn(`[Background] Ошибка чтения ${key}:`, err);
    return null;
  }
}

/**
 * Сохраняет или обновляет заметку
 */
async function saveNote(noteId, data) {
  if (!noteId) return { success: false, error: 'No noteId' };
  const key = `${STORAGE_KEY_PREFIX}${noteId}`;
  try {
    const existing = await chrome.storage.local.get([key]);
    await chrome.storage.local.set({
      [key]: {
        ...(existing[key] || {}),
        ...data,
        timestamp: Date.now()
      }
    });
    return { success: true };
  } catch (err) {
    console.warn(`[Background] Ошибка сохранения ${key}:`, err);
    return { success: false, error: err.message };
  }
}

/**
 * Возвращает дамп всех заметок для отладки
 */
async function getDebugDump() {
  try {
    const all = await chrome.storage.local.get(null);
    return Object.entries(all)
      .filter(([k]) => k.startsWith(STORAGE_KEY_PREFIX))
      .map(([k, v]) => ({
        key: k,
        title: v.title || '(без заголовка)',
        content: v.content?.slice(0, 50) + '...',
        timestamp: new Date(v.timestamp || 0).toLocaleString('ru-RU')
      }));
  } catch (err) {
    console.warn('[Background] Ошибка дампа:', err);
    return [];
  }
}

// === ОБРАБОТЧИКИ СОБЫТИЙ ===

chrome.action.onClicked.addListener(() => {
  openSelectionTab();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  
  const handlers = {
    'CREATE_NOTE': () => createNewNote(request.title, tabId),
    'OPEN_NOTE': () => openExistingNote(request.noteId, tabId),
    'DELETE_NOTE': () => deleteNoteById(request.noteId),
    'GET_NOTES_SUMMARY': getAllNotesSummary,
    'GET_NOTE': () => getNoteById(request.noteId),
    'SAVE_NOTE': () => saveNote(request.noteId, request.data),
    'DEBUG_DUMP': getDebugDump,
    'CLOSE_TAB': () => {
      if (tabId) {
        chrome.tabs.remove(tabId);
        return { success: true };
      }
      return { success: false, error: 'No tab id' };
    },
    'OPEN_SELECTION': () => openSelectionTab()
  };
  
  if (handlers[request.type]) {
    handlers[request.type]()
      .then(sendResponse)
      .catch(err => {
        console.warn(`[Background] Ошибка ${request.type}:`, err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[Background] v${details.version} — ${details.reason}`);
});