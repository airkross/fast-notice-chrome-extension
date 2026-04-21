const notesSelect = document.getElementById('notesSelect');
const noNotesMessage = document.getElementById('noNotesMessage');
const newNoteTitleInput = document.getElementById('newNoteTitle');
const createBtn = document.getElementById('createBtn');

let isProcessing = false;

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
        const option = document.createElement('option');
        option.value = note.id;
        option.textContent = note.title || note.key;
        notesSelect.appendChild(option);
      });
    }
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

async function createNewNote() {
  const title = newNoteTitleInput.value.trim();
  if (!title || isProcessing) return;
  
  isProcessing = true;
  createBtn.disabled = true;
  createBtn.textContent = 'Создание...';
  
  try {
    const response = await sendToBackground('CREATE_NOTE', { title });
    
    if (!response?.success) {
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

async function openExistingNote(noteId) {
  if (!noteId || isProcessing) return;
  
  isProcessing = true;
  
  try {
    await sendToBackground('OPEN_NOTE', { noteId });
  } catch (err) {
    console.warn('[Selection] Ошибка открытия:', err);
    alert('Ошибка при открытии заметки');
    isProcessing = false;
  }
}

function initSelection() {
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
    if (noteId) openExistingNote(noteId);
  });
  console.log('[Selection] Инициализировано');
}

if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
  initSelection();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sendToBackground,
    loadNotesList,
    updateCreateButtonState,
    createNewNote,
    openExistingNote,
    initSelection,
  };
}