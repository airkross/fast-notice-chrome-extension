/**
 * selection.js — Логика страницы выбора/создания заметки
 * v2.0.2: Исправлено — нет диалога "Закрыть сайт?" при создании/выборе
 */

// === DOM-ЭЛЕМЕНТЫ ===
const notesSelect = document.getElementById('notesSelect');
const noNotesMessage = document.getElementById('noNotesMessage');
const newNoteTitleInput = document.getElementById('newNoteTitle');
const createBtn = document.getElementById('createBtn');

// === СОСТОЯНИЕ ===
let isProcessing = false; // Флаг: идёт ли обработка создания/выбора

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===

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

async function loadNotesList() {
  try {
    const notes = await sendToBackground('GET_NOTES_SUMMARY');
    
    notesSelect.innerHTML = '';
    
    if (notes.length === 0) {
      notesSelect.disabled = true;
      notesSelect.innerHTML = '<option value="" disabled>Нет заметок</option>';
      noNotesMessage.classList.add('visible');
    } else {
      notesSelect.disabled = false;
      noNotesMessage.classList.remove('visible');
      
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.disabled = true;
      placeholder.selected = true;
      placeholder.textContent = 'Выберите заметку...';
      notesSelect.appendChild(placeholder);
      
      notes.forEach(note => {
        const displayName = note.title || note.key;
        const option = document.createElement('option');
        option.value = note.id;
        option.textContent = displayName;
        option.dataset.key = note.key;
        notesSelect.appendChild(option);
      });
    }
    
    console.log('[Selection] Загружено заметок:', notes.length);
  } catch (err) {
    console.warn('[Selection] Ошибка загрузки списка:', err);
    notesSelect.innerHTML = '<option value="" disabled>Ошибка загрузки</option>';
    notesSelect.disabled = true;
  }
}

function updateCreateButtonState() {
  const title = newNoteTitleInput.value.trim();
  createBtn.disabled = !title || isProcessing;
}

/**
 * Создаёт новую заметку
 * ✅ ИСПРАВЛЕНО: заметка создаётся в background только после navigation
 */
async function createNewNote() {
  const title = newNoteTitleInput.value.trim();
  if (!title || isProcessing) return;
  
  isProcessing = true;
  createBtn.disabled = true;
  createBtn.textContent = 'Создание...';
  
  try {
    const response = await sendToBackground('CREATE_NOTE', { title });
    
    if (response?.success) {
      console.log('[Selection] Заметка создана:', response.noteId);
      // ✅ Не вызываем close — background уже обновил URL вкладки
      // ✅ Если пользователь отменит navigation — вкладка останется на selection.html
      // ✅ Заметка не создастся в хранилище (background создаёт после tabs.update)
    } else {
      alert('Ошибка создания заметки: ' + (response?.error || 'Неизвестная ошибка'));
      isProcessing = false;
      updateCreateButtonState();
      createBtn.textContent = 'Создать';
    }
  } catch (err) {
    console.warn('[Selection] Ошибка создания:', err);
    alert('Ошибка при создании заметки');
    isProcessing = false;
    updateCreateButtonState();
    createBtn.textContent = 'Создать';
  }
}

/**
 * Открывает существующую заметку
 * ✅ ИСПРАВЛЕНО: нет beforeunload который блокирует навигацию
 */
async function openExistingNote(noteId) {
  if (!noteId || isProcessing) return;
  
  isProcessing = true;
  
  try {
    await sendToBackground('OPEN_NOTE', { noteId });
    console.log('[Selection] Открыта заметка:', noteId);
    // ✅ background обновит URL текущей вкладки
  } catch (err) {
    console.warn('[Selection] Ошибка открытия:', err);
    alert('Ошибка при открытии заметки');
    isProcessing = false;
  }
}

// === ОБРАБОТЧИКИ СОБЫТИЙ ===

loadNotesList();

newNoteTitleInput.addEventListener('input', updateCreateButtonState);

createBtn.addEventListener('click', createNewNote);

newNoteTitleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !createBtn.disabled) {
    e.preventDefault();
    createNewNote();
  }
});

notesSelect.addEventListener('change', (e) => {
  const noteId = e.target.value;
  if (noteId) {
    openExistingNote(noteId);
  }
});

// ✅ УДАЛЕНО: beforeunload который вызывал диалог "Закрыть сайт?"
// Теперь вкладка закрывается тихо если пользователь нажал на крестик
// Это корректное поведение — заметка ещё не создана, ничего не теряется

console.log('[Selection] Инициализировано');