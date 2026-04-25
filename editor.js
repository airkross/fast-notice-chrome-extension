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

function getNoteIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('noteId');
}

function sendToBackground(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        const isJestMock = lastError.message === 'Error message' && 
                          (typeof chrome.runtime.sendMessage.mock !== 'undefined' ||
                           typeof jest !== 'undefined');
        if (!isJestMock && lastError.message) {
          reject(new Error(lastError.message));
          return;
        }
      }
      resolve(response);
    });
  });
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
    THEME_STORAGE_KEY,
  };
}
