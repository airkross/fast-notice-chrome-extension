/**
 * editor.js — Логика редактора (v2.0.2)
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

const editor = document.getElementById('editor');
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
  
  const content = editor.innerHTML;
  const title = noteTitleInput.value.trim();
  
  try {
    updateSaveStatus(SAVE_STATUS.SAVING);
    
    await sendToBackground('SAVE_NOTE', {
      noteId: currentNoteId,
      data: { content, title }
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
      editor.innerHTML = note.content || '';
      
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
        option.dataset.title = note.title || '';
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
  
  const content = editor.textContent?.trim();
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
      // После удаления — открываем страницу выбора в новой вкладке
      await sendToBackground('OPEN_SELECTION');
      // Закрываем текущую вкладку с редактором
      await sendToBackground('CLOSE_TAB');
    } else {
      alert('Не удалось удалить: ' + (response?.error || 'Неизвестная ошибка'));
    }
  } catch (err) {
    console.warn('[Editor] Ошибка удаления:', err);
    alert('Ошибка при удалении. Проверьте консоль.');
  }
}

function autoLinkifyText() {
  const urlPattern = /\b(https?:\/\/[^\s<]+[^\s<.,;:!?])/gi;
  
  function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent;
      if (urlPattern.test(text)) {
        const span = document.createElement('span');
        span.innerHTML = text.replace(
          urlPattern,
          '<a href="$1" target="_blank" rel="noopener">$1</a>'
        );
        node.parentNode?.replaceChild(span, node);
        span.childNodes.forEach(child => {
          if (child.nodeType === Node.TEXT_NODE) processNode(child);
        });
      }
    } else if (node.nodeType === Node.ELEMENT_NODE && 
               !['A', 'SCRIPT', 'STYLE', 'IMG'].includes(node.tagName)) {
      Array.from(node.childNodes).forEach(processNode);
    }
  }
  
  if (editor.textContent?.trim()) {
    const content = editor.innerHTML;
    editor.innerHTML = '';
    const temp = document.createElement('div');
    temp.innerHTML = content;
    processNode(temp);
    editor.innerHTML = temp.innerHTML;
  }
}

function handleImagePaste(event) {
  const items = event.clipboardData?.items;
  if (!items) return;
  
  for (const item of items) {
    if (item.type?.indexOf('image') === 0) {
      event.preventDefault();
      const blob = item.getAsFile();
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const img = document.createElement('img');
        img.src = e.target?.result;
        img.alt = 'Вставленное изображение';
        
        const selection = window.getSelection();
        if (!selection?.rangeCount) {
          editor.appendChild(img);
        } else {
          const range = selection.getRangeAt(0);
          range.insertNode(img);
          range.collapse(false);
        }
        debouncedSave();
      };
      reader.readAsDataURL(blob);
      break;
    }
  }
}

function setupEventListeners() {
  editor.addEventListener('input', debouncedSave);
  
  let titleDebounceTimer;
  noteTitleInput.addEventListener('input', () => {
    if (titleDebounceTimer) clearTimeout(titleDebounceTimer);
    titleDebounceTimer = setTimeout(() => {
      if (!isLoadingNote) debouncedSave();
    }, 300);
  });
  
  editor.addEventListener('paste', (e) => {
    if (e.clipboardData?.items) {
      const hasImage = Array.from(e.clipboardData.items)
        .some(item => item.type?.indexOf('image') === 0);
      if (hasImage) {
        handleImagePaste(e);
        return;
      }
    }
    setTimeout(() => { autoLinkifyText(); debouncedSave(); }, 10);
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
  
  const existing = await sendToBackground('GET_NOTE', { noteId: currentNoteId });
  if (!existing) {
    await sendToBackground('SAVE_NOTE', {
      noteId: currentNoteId,
      data: { content: '', title: '', createdAt: Date.now() }
    });
  } else {
    noteTitleInput.value = existing.title || '';
    lastSavedTitle = existing.title || '';
    editor.innerHTML = existing.content || '';
  }
  
  await refreshNotesList();
  notesSelect.value = currentNoteId;
  
  setupEventListeners();
  
  if (!existing?.content?.trim() && !existing?.title?.trim()) {
    setTimeout(() => noteTitleInput.focus(), 100);
  }
  
  console.log('[Editor] Инициализировано. Note ID:', currentNoteId);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}