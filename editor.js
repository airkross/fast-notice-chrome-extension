/**
 * editor.js — Логика редактора (v3.1.0)
 * Интеграция с TextEditor компонентом
 */

const STORAGE_KEY_PREFIX = 'note_';
const DEBOUNCE_DELAY = 400;
const SAVE_STATUS = {
  READY: 'Готово',
  SAVING: 'Сохранение...',
  SAVED: 'Сохранено ✓'
};

let currentNoteId = null;
let storageKey = null;
let saveDebounceTimer = null;
let isLoadingNote = false;
let lastSavedTitle = '';
let textEditor = null;

const noteTitleInput = document.getElementById('noteTitle');
const notesSelect = document.getElementById('notesList');
const saveStatusEl = document.getElementById('saveStatus');
const deleteBtn = document.getElementById('deleteNote');
const debugBtn = document.getElementById('debugBtn');
const debugModal = document.getElementById('debugModal');
const closeModalBtn = document.getElementById('closeModal');
const debugTableBody = document.getElementById('debugTableBody');

function getNoteIdFromUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('noteId');
}

function sendToBackground(type, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, ...payload }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
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
  }
}

async function saveCurrentNote() {
  if (!storageKey || !currentNoteId) return;
  
  const content = textEditor ? textEditor.getContent() : '';
  const title = noteTitleInput.value.trim();
  
  try {
    updateSaveStatus(SAVE_STATUS.SAVING);
    
    // ✅ Сохраняем только HTML-контент (универсальный формат)
    await sendToBackground('SAVE_NOTE', {
      noteId: currentNoteId,
      data: { 
        content, 
        title,
        timestamp: Date.now()
      }
    });
    
    if (title !== lastSavedTitle) {
      lastSavedTitle = title;
      await refreshNotesList();
      notesSelect.value = currentNoteId;
    }
    
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
      
      // ✅ Загружаем HTML-контент напрямую
      if (textEditor) {
        textEditor.setContent(note.content || '');
      }
      
      const newUrl = `${window.location.pathname}?noteId=${noteId}`;
      window.history.replaceState({}, '', newUrl);
      
      await refreshNotesList();
      notesSelect.value = currentNoteId;
      
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

async function refreshNotesList() {
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
    
    if (notes.some(n => n.id === currentNoteId)) {
      notesSelect.value = currentNoteId;
    }
    
  } catch (err) {
    console.warn('[Editor] Ошибка обновления списка:', err);
    notesSelect.innerHTML = '<option value="" disabled selected>📋 Ошибка загрузки...</option>';
  }
}

async function populateDebugTable() {
  try {
    const data = await sendToBackground('DEBUG_DUMP');
    debugTableBody.innerHTML = '';
    
    if (data.length === 0) {
      debugTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--text-secondary)">Нет заметок</td></tr>';
      return;
    }
    
    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>${row.key}</code></td>
        <td>${row.title || '(без заголовка)'}</td>
        <td title="${row.content}">${row.content}</td>
        <td>${row.timestamp}</td>
      `;
      debugTableBody.appendChild(tr);
    });
  } catch (err) {
    console.warn('[Editor] Ошибка таблицы:', err);
    debugTableBody.innerHTML = `<tr><td colspan="4" style="color:var(--danger-color)">Ошибка: ${err.message}</td></tr>`;
  }
}

function toggleDebugModal(show) {
  if (show) {
    populateDebugTable();
    debugModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  } else {
    debugModal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

async function deleteCurrentNote() {
  if (!currentNoteId) return;
  
  const content = textEditor ? textEditor.getTextContent() : '';
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

function setupEventListeners() {
  noteTitleInput.addEventListener('input', () => {
    if (!isLoadingNote) debouncedSave();
  });
  
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
  
  notesSelect.addEventListener('change', (e) => {
    const selectedId = e.target.value;
    if (selectedId && selectedId !== currentNoteId) {
      loadNoteById(selectedId);
    }
  });
  
  deleteBtn.addEventListener('click', deleteCurrentNote);
  debugBtn.addEventListener('click', () => toggleDebugModal(true));
  closeModalBtn.addEventListener('click', () => toggleDebugModal(false));
  debugModal.addEventListener('click', (e) => {
    if (e.target === debugModal) toggleDebugModal(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !debugModal.classList.contains('hidden')) {
      toggleDebugModal(false);
    }
  });
}

async function init() {
  const urlNoteId = getNoteIdFromUrl();
  
  if (!urlNoteId) {
    console.log('[Editor] Нет noteId, закрываем вкладку');
    await sendToBackground('CLOSE_TAB');
    return;
  }
  
  currentNoteId = urlNoteId;
  storageKey = `${STORAGE_KEY_PREFIX}${currentNoteId}`;
  
  // Инициализация TextEditor
  const editorElement = document.getElementById('textEditor');
  if (editorElement) {
    textEditor = new TextEditor(editorElement, {
      onChange: (content) => {
        debouncedSave();
      }
    });
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
    
    if (textEditor) {
      textEditor.setContent(existing.content || '');
    }
  }
  
  await refreshNotesList();
  notesSelect.value = currentNoteId;
  
  setupEventListeners();
  
  console.log('[Editor] Инициализировано. Note ID:', currentNoteId);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}