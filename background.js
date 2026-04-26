/**
 * background.js — фоновый скрипт расширения (Manifest V3)
 * v3.1.0: Убран формат из сохранения (теперь только HTML)
 */

const STORAGE_KEY_PREFIX = 'note_';

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

async function createNewNote(title, tabId) {
  try {
    const noteId = `note_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    
    if (tabId) {
      await chrome.tabs.update(tabId, {
        url: `${chrome.runtime.getURL('editor.html')}?noteId=${noteId}`
      });
    }
    
    await chrome.storage.local.set({
      [`${STORAGE_KEY_PREFIX}${noteId}`]: {
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

async function openExistingNote(noteId, tabId) {
  try {
    if (tabId) {
      await chrome.tabs.update(tabId, {
        url: `${chrome.runtime.getURL('editor.html')}?noteId=${noteId}`
      });
    }
    console.log('[Background] Открыта заметка:', noteId);
    return { success: true };
  } catch (err) {
    console.warn('[Background] Ошибка открытия заметки:', err);
    return { success: false, error: err.message };
  }
}

async function deleteNoteById(noteId) {
  if (!noteId) return { success: false, error: 'No noteId provided' };
  
  const key = `${STORAGE_KEY_PREFIX}${noteId}`;
  try {
    const check = await chrome.storage.local.get([key]);
    if (!check[key]) {
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

async function saveNote(noteId, data) {
  if (!noteId) return { success: false, error: 'No noteId' };
  const key = `${STORAGE_KEY_PREFIX}${noteId}`;
  try {
    const existing = await chrome.storage.local.get([key]);
    const contentSize = data.content ? data.content.length : 0;
    console.log(`[Background] Сохранение заметки ${noteId}, размер контента: ${contentSize} символов`);
    
    await chrome.storage.local.set({
      [key]: {
        ...(existing[key] || {}),
        ...data,
        timestamp: Date.now()
      }
    });
    
    // Проверяем что данные сохранились
    const verify = await chrome.storage.local.get([key]);
    if (!verify[key]) {
      throw new Error('Сохранение не подтверждено');
    }
    
    console.log(`[Background] Заметка ${noteId} сохранена успешно`);
    return { success: true };
  } catch (err) {
    console.error(`[Background] Ошибка сохранения ${key}:`, err);
    console.error(`[Background] Размер данных:`, JSON.stringify(data).length);
    return { success: false, error: err.message };
  }
}

async function getDebugDump() {
  try {
    const all = await chrome.storage.local.get(null);
    return Object.entries(all)
      .filter(([k, v]) => k.startsWith(STORAGE_KEY_PREFIX) && v)
      .map(([k, v]) => ({
        key: k,
        id: k.replace(STORAGE_KEY_PREFIX, ''),
        title: v.title || '(без заголовка)',
        content: (v.content || '').slice(0, 50) + ((v.content || '').length > 50 ? '...' : ''),
        timestamp: new Date(v.timestamp || 0).toLocaleString('ru-RU')
      }));
  } catch (err) {
    console.warn('[Background] Ошибка дампа:', err);
    return [];
  }
}

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
    'OPEN_SELECTION': () => openSelectionTab(),
    'GET_TAB_GROUP_INFO': async () => {
      try {
        console.log('[Background] Получаем информацию о группах вкладок...');
        
        // Получаем все вкладки текущего окна
        const tabs = await chrome.tabs.query({ currentWindow: true });
        
        // Находим вкладку редактора
        const editorTab = tabs.find(t => t.url && t.url.includes('editor.html'));
        
        if (!editorTab) {
          return { 
            success: true, 
            inGroup: false, 
            hasOtherTabs: tabs.length > 0,
            totalTabs: tabs.length
          };
        }
        
        // Проверяем, находится ли редактор в группе
        if (editorTab.groupId && editorTab.groupId !== -1) {
          // Получаем информацию о группе
          try {
            const group = await chrome.tabGroups.get(editorTab.groupId);
            console.log('[Background] Редактор в группе:', group.title, group.id);
            
            // Получаем все вкладки в этой группе
            const groupTabs = await chrome.tabs.query({ groupId: editorTab.groupId });
            const otherGroupTabs = groupTabs.filter(t => t.id !== editorTab.id);
            
            return {
              success: true,
              inGroup: true,
              groupId: group.id,
              groupTitle: group.title,
              groupTabsCount: groupTabs.length,
              otherGroupTabsCount: otherGroupTabs.length,
              hasOtherTabs: tabs.length > 1,
              totalTabs: tabs.length
            };
          } catch (groupErr) {
            console.warn('[Background] Ошибка получения группы:', groupErr);
            return {
              success: true,
              inGroup: false,
              hasOtherTabs: tabs.length > 1,
              totalTabs: tabs.length
            };
          }
        }
        
        return { 
          success: true, 
          inGroup: false, 
          hasOtherTabs: tabs.length > 1,
          totalTabs: tabs.length
        };
      } catch (err) {
        console.error('[Background] Ошибка получения информации о группах:', err);
        return { success: false, error: err.message };
      }
    },
    
    'COLLECT_TABS': async () => {
      try {
        console.log('[Background] Начинаем сбор вкладок...');
        
        // Получаем все вкладки текущего окна
        const tabs = await chrome.tabs.query({ currentWindow: true });
        console.log('[Background] Всего вкладок в окне:', tabs.length);
        
        // Фильтруем: исключаем вкладку редактора по URL
        // Редактор имеет URL содержащий 'editor.html'
        const otherTabs = tabs.filter(t => 
          t.url && !t.url.includes('editor.html')
        );
        console.log('[Background] Других вкладок (без редактора):', otherTabs.length);
        
        // Собираем данные: url, title, favIconUrl
        const tabData = otherTabs.map(tab => ({
          url: tab.url,
          title: tab.title || 'Без названия',
          favIconUrl: tab.favIconUrl || ''
        }));
        
        console.log(`[Background] Собрано ${tabData.length} вкладок`, tabData);
        return { success: true, tabs: tabData };
      } catch (err) {
        console.error('[Background] Ошибка сбора вкладок:', err);
        console.error('[Background] Тип ошибки:', err.constructor?.name);
        console.error('[Background] Стек:', err.stack);
        return { success: false, error: err.message || String(err), tabs: [] };
      }
    },
    
    'COLLECT_TABS_FROM_GROUP': async () => {
      try {
        console.log('[Background] Сбор вкладок из группы...');
        
        // Получаем все вкладки текущего окна
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        
        // Находим вкладку редактора
        const editorTab = allTabs.find(t => t.url && t.url.includes('editor.html'));
        
        if (!editorTab || !editorTab.groupId || editorTab.groupId === -1) {
          console.log('[Background] Редактор не в группе, собираем все вкладки');
          const otherTabs = allTabs.filter(t => t.url && !t.url.includes('editor.html'));
          const tabData = otherTabs.map(tab => ({
            url: tab.url,
            title: tab.title || 'Без названия',
            favIconUrl: tab.favIconUrl || ''
          }));
          return { success: true, tabs: tabData, fromGroup: false };
        }
        
        // Получаем все вкладки в группе редактора
        const groupTabs = await chrome.tabs.query({ groupId: editorTab.groupId });
        console.log('[Background] Вкладок в группе:', groupTabs.length);
        
        // Исключаем вкладку редактора
        const otherGroupTabs = groupTabs.filter(t => t.id !== editorTab.id);
        
        const tabData = otherGroupTabs.map(tab => ({
          url: tab.url,
          title: tab.title || 'Без названия',
          favIconUrl: tab.favIconUrl || ''
        }));
        
        console.log(`[Background] Собрано из группы ${tabData.length} вкладок`, tabData);
        return { success: true, tabs: tabData, fromGroup: true };
      } catch (err) {
        console.error('[Background] Ошибка сбора вкладок из группы:', err);
        return { success: false, error: err.message || String(err), tabs: [] };
      }
    }
  };
  
  if (handlers[request.type]) {
    const handler = handlers[request.type];
    const result = handler();
    
    // Если результат - Promise (для async функций), ждём его
    if (result && typeof result.then === 'function') {
      result
        .then(data => sendResponse(data))
        .catch(err => {
          console.warn(`[Background] Ошибка ${request.type}:`, err);
          sendResponse({ success: false, error: err.message || String(err) });
        });
      return true; // Важно: возвращаем true для асинхронного ответа
    } else {
      // Синхронный обработчик
      sendResponse(result);
      return false;
    }
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  console.log(`[Background] v${details.version} — ${details.reason}`);
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    createNewNote,
    openExistingNote,
    deleteNoteById,
    getAllNotesSummary,
    getNoteById,
    saveNote,
    getDebugDump,
  };
}
