const notesSelect = document.getElementById('notesSelect');
const noNotesMessage = document.getElementById('noNotesMessage');
const newNoteTitleInput = document.getElementById('newNoteTitle');
const createBtn = document.getElementById('createBtn');
const debugBtn = document.getElementById('debugBtn');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const debugModal = document.getElementById('debugModal');
const closeModalBtn = document.getElementById('closeModal');
const debugTableBody = document.getElementById('debugTableBody');

// Custom Dropdown Elements
const customDropdown = document.getElementById('customDropdown');
const dropdownTrigger = document.getElementById('dropdownTrigger');
const dropdownMenu = document.getElementById('dropdownMenu');

let isProcessing = false;
let notesData = [];
let highlightedIndex = -1;

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

function populateSelectElement(selectEl, notes) {
  if (!selectEl) return;
  
  selectEl.innerHTML = '';
  
  if (notes.length === 0) {
    selectEl.disabled = true;
    selectEl.innerHTML = '<option value="" disabled>Нет заметок</option>';
  } else {
    selectEl.disabled = false;
    
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = 'Выберите заметку...';
    selectEl.appendChild(placeholder);
    
    notes.forEach(note => {
      const option = document.createElement('option');
      option.value = note.id;
      option.textContent = note.title || note.key;
      selectEl.appendChild(option);
    });
  }
}

async function loadNotesList() {
  if (!notesSelect) return;
  
  try {
    const notes = await sendToBackground('GET_NOTES_SUMMARY');
    
    // Обновляем селект
    populateSelectElement(notesSelect, notes);
    
    if (notes.length === 0) {
      if (noNotesMessage) noNotesMessage.classList.add('visible');
    } else {
      if (noNotesMessage) noNotesMessage.classList.remove('visible');
    }
  } catch (err) {
    console.warn('[Selection] Ошибка загрузки списка:', err);
    const errorOptions = '<option value="" disabled>Ошибка загрузки</option>';
    if (notesSelect) {
      notesSelect.innerHTML = errorOptions;
      notesSelect.disabled = true;
    }
  }
}

function updateCreateButtonState() {
  const title = newNoteTitleInput.value.trim();
  if (createBtn) {
    createBtn.disabled = !title || isProcessing;
  }
}

async function createNewNote() {
  const title = newNoteTitleInput.value.trim();
  if (!title || isProcessing) return;
  
  isProcessing = true;
  if (createBtn) {
    createBtn.disabled = true;
    createBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg> Создание...';
  }
  
  try {
    const response = await sendToBackground('CREATE_NOTE', { title });
    
    if (!response?.success) {
      alert('Ошибка создания заметки: ' + (response?.error || 'Неизвестная ошибка'));
      isProcessing = false;
      updateCreateButtonState();
      if (createBtn) {
        createBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Создать';
      }
    } else {
      // Успешное создание - сбрасываем состояние
      newNoteTitleInput.value = '';
      isProcessing = false;
      if (createBtn) {
        createBtn.disabled = true;
        createBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Создать';
      }
      // Обновляем список заметок
      await loadNotesList();
    }
  } catch (err) {
    console.warn('[Selection] Ошибка создания:', err);
    alert('Ошибка при создании заметки');
    isProcessing = false;
    updateCreateButtonState();
    if (createBtn) {
      createBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Создать';
    }
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

async function populateDebugTable() {
  // Защита от null - элемент таблицы может отсутствовать в DOM
  if (!debugTableBody) {
    console.warn('[Selection] Элемент debugTableBody не найден в DOM');
    return;
  }
  
  try {
    const data = await sendToBackground('DEBUG_DUMP');
    debugTableBody.innerHTML = '';
    
    if (data.length === 0) {
      debugTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Нет заметок</td></tr>';
      return;
    }
    
    data.forEach(row => {
      const tr = document.createElement('tr');
      tr.dataset.noteId = row.id;
      tr.innerHTML = `
        <td><code>${row.key}</code></td>
        <td>${row.title || '(без заголовка)'}</td>
        <td title="${row.content}">${row.content}</td>
        <td>${row.timestamp}</td>
        <td><button class="btn-delete-row" title="Удалить заметку">🗑️</button></td>
      `;
      
      // Кнопка удаления - защита от null
      const deleteBtn = tr.querySelector('.btn-delete-row');
      if (!deleteBtn) {
        console.warn('[Selection] Кнопка удаления не найдена в строке:', row.id);
        return;
      }
      
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const noteTitle = row.title || '(без заголовка)';
        const confirmed = confirm(`Удалить заметку "${noteTitle}"?`);
        
        if (confirmed) {
          try {
            await sendToBackground('DELETE_NOTE', { noteId: row.id });
            // Удаляем строку из таблицы
            tr.remove();
            // Обновляем список заметок
            await loadNotesList();
          } catch (err) {
            console.warn('[Selection] Ошибка удаления:', err);
            alert('Ошибка удаления заметки');
          }
        }
      });
      
      debugTableBody.appendChild(tr);
    });
  } catch (err) {
    console.warn('[Selection] Ошибка таблицы:', err);
    if (debugTableBody) {
      debugTableBody.innerHTML = `<tr><td colspan="5" style="color:red">Ошибка: ${err.message}</td></tr>`;
    }
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

/* === Custom Dropdown Functions === */

function populateCustomDropdown(notes) {
  notesData = notes;
  highlightedIndex = -1;
  
  if (!dropdownMenu) return;
  
  dropdownMenu.innerHTML = '';
  
  if (notes.length === 0) {
    dropdownMenu.innerHTML = '<li class="dropdown-empty">Нет сохранённых заметок</li>';
    return;
  }
  
  notes.forEach((note, index) => {
    const li = document.createElement('li');
    li.className = 'dropdown-option';
    li.dataset.index = index;
    li.dataset.noteId = note.id;
    li.innerHTML = `
      <span class="dropdown-option-content">${note.title || note.key}</span>
      <span class="dropdown-option-meta">${note.timestamp || ''}</span>
    `;
    
    li.addEventListener('click', () => selectDropdownOption(note.id));
    li.addEventListener('mouseenter', () => {
      highlightedIndex = index;
      updateDropdownHighlight();
    });
    
    dropdownMenu.appendChild(li);
  });
}

function updateDropdownTriggerText(text) {
  if (!dropdownTrigger) return;
  const selectedText = dropdownTrigger.querySelector('.dropdown-selected-text');
  if (selectedText) {
    selectedText.textContent = text;
  }
}

function updateDropdownHighlight() {
  if (!dropdownMenu) return;
  const options = dropdownMenu.querySelectorAll('.dropdown-option');
  options.forEach((opt, idx) => {
    opt.classList.toggle('highlighted', idx === highlightedIndex);
    if (idx === highlightedIndex) {
      opt.scrollIntoView({ block: 'nearest' });
    }
  });
}

function openDropdown() {
  if (!dropdownTrigger || !dropdownMenu) return;
  dropdownTrigger.classList.add('open');
  dropdownMenu.classList.add('open');
  highlightedIndex = -1;
}

function closeDropdown() {
  if (!dropdownTrigger || !dropdownMenu) return;
  dropdownTrigger.classList.remove('open');
  dropdownMenu.classList.remove('open');
  highlightedIndex = -1;
}

function toggleDropdown() {
  if (!dropdownTrigger) return;
  const isOpen = dropdownTrigger.classList.contains('open');
  if (isOpen) {
    closeDropdown();
  } else {
    openDropdown();
  }
}

function selectDropdownOption(noteId) {
  if (!noteId) return;
  
  // Update trigger text
  const note = notesData.find(n => n.id === noteId);
  if (note) {
    updateDropdownTriggerText(note.title || note.key);
  }
  
  // Update native select for accessibility
  if (notesSelect) {
    notesSelect.value = noteId;
    notesSelect.dispatchEvent(new Event('change', { bubbles: true }));
  }
  
  closeDropdown();
  
  // Open the note
  openExistingNote(noteId);
}

function handleDropdownKeydown(e) {
  if (!dropdownMenu || !dropdownMenu.classList.contains('open')) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openDropdown();
    }
    return;
  }
  
  const options = dropdownMenu.querySelectorAll('.dropdown-option');
  
  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, options.length - 1);
      updateDropdownHighlight();
      break;
    case 'ArrowUp':
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      updateDropdownHighlight();
      break;
    case 'Enter':
    case ' ':
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < notesData.length) {
        selectDropdownOption(notesData[highlightedIndex].id);
      }
      break;
    case 'Escape':
      e.preventDefault();
      closeDropdown();
      break;
    case 'Tab':
      closeDropdown();
      break;
  }
}

function initCustomDropdown() {
  if (!dropdownTrigger || !dropdownMenu) return;
  
  // Toggle dropdown on click
  dropdownTrigger.addEventListener('click', (e) => {
    e.preventDefault();
    toggleDropdown();
  });
  
  // Keyboard navigation
  dropdownTrigger.addEventListener('keydown', handleDropdownKeydown);
  
  // Close on outside click
  document.addEventListener('click', (e) => {
    if (customDropdown && !customDropdown.contains(e.target)) {
      closeDropdown();
    }
  });
  
  // Close on escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dropdownMenu && dropdownMenu.classList.contains('open')) {
      closeDropdown();
    }
  });
}

function updateCustomDropdownState(notes, isLoading = false) {
  if (!dropdownTrigger) return;
  
  if (isLoading) {
    dropdownTrigger.disabled = true;
    updateDropdownTriggerText('Загрузка списка...');
    if (dropdownMenu) {
      dropdownMenu.innerHTML = '<li class="dropdown-empty">Загрузка...</li>';
    }
    return;
  }
  
  dropdownTrigger.disabled = notes.length === 0;
  
  if (notes.length === 0) {
    updateDropdownTriggerText('Нет сохранённых заметок');
    if (dropdownMenu) {
      dropdownMenu.innerHTML = '<li class="dropdown-empty">Нет сохранённых заметок</li>';
    }
  } else {
    updateDropdownTriggerText('Выберите заметку...');
  }
  
  populateCustomDropdown(notes);
}

// Override loadNotesList to also update custom dropdown
const originalLoadNotesList = loadNotesList;
loadNotesList = async function() {
  if (!notesSelect) return;
  
  try {
    const notes = await sendToBackground('GET_NOTES_SUMMARY');
    
    // Обновляем нативный селект
    populateSelectElement(notesSelect, notes);
    
    // Обновляем кастомный dropdown
    updateCustomDropdownState(notes, false);
    
    if (notes.length === 0) {
      if (noNotesMessage) noNotesMessage.classList.add('visible');
    } else {
      if (noNotesMessage) noNotesMessage.classList.remove('visible');
    }
  } catch (err) {
    console.warn('[Selection] Ошибка загрузки списка:', err);
    const errorOptions = '<option value="" disabled>Ошибка загрузки</option>';
    if (notesSelect) {
      notesSelect.innerHTML = errorOptions;
      notesSelect.disabled = true;
    }
    updateCustomDropdownState([], false);
  }
};

function initSelection() {
  // Initialize custom dropdown
  initCustomDropdown();
  
  // Load notes
  loadNotesList();
  
  // Обработчики для формы создания заметки
  if (newNoteTitleInput) {
    newNoteTitleInput.addEventListener('input', updateCreateButtonState);
    newNoteTitleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && createBtn && !createBtn.disabled) {
        e.preventDefault();
        createNewNote();
      }
    });
  }
  
  if (createBtn) {
    createBtn.addEventListener('click', createNewNote);
  }
  
  if (notesSelect) {
    notesSelect.addEventListener('change', (e) => {
      const noteId = e.target.value;
      if (noteId) {
        openExistingNote(noteId);
      }
    });
  }
  
  // Обработчик переключения темы
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isDark = document.body.classList.toggle('dark-theme');
      document.body.classList.toggle('light-theme', !isDark);
      // Сохраняем выбор темы
      localStorage.setItem('theme', isDark ? 'dark' : 'light');
    });
    
    // Применяем сохранённую тему
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.body.classList.add('dark-theme');
    } else if (savedTheme === 'light') {
      document.body.classList.add('light-theme');
    }
  }
  
  // Обработчики модального окна "Все заметки"
  if (debugBtn) {
    debugBtn.addEventListener('click', () => toggleDebugModal(true));
  }
  if (closeModalBtn) {
    closeModalBtn.addEventListener('click', () => toggleDebugModal(false));
  }
  if (debugModal) {
    debugModal.addEventListener('click', (e) => {
      if (e.target === debugModal) toggleDebugModal(false);
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && debugModal && !debugModal.classList.contains('hidden')) {
      toggleDebugModal(false);
    }
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
    populateDebugTable,
    toggleDebugModal,
    initSelection,
    // Для тестов
    _setProcessing: (val) => { isProcessing = val; },
    _getProcessing: () => isProcessing,
  };
}
