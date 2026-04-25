### 📁 Workspace Rules (Правила рабочей директории)

```
/Users/ruslaguseynov/Desktop/fast-notice-chrome-extension/
├── manifest.json     — версия 3.2.1, имена权限: storage, tabs
├── background.js     — CRUD заметок, chrome.storage.local
├── editor.js         — редактирование, автосохранение, форматирование
├── texteditor.js     — contenteditable логика, заголовки h1-h5
├── selection.js      — экран выбора заметок
├── editor.html/css   — UI редактора с тултипом для ссылок
├── selection.html/css— UI выбора заметок
└── tests/            — Playwright + Jest
```

**Ключевые функции в background.js**:
- `createNewNote(title, tabId)` → создаёт заметку
- `getAllNotesSummary()` → возвращает массив {id, title, preview, timestamp}
- `saveNote(noteId, data)` → сохраняет в storage
- `deleteNoteById(noteId)` → удаляет

**Важно**: При работе с форматом (h1→p) нужно избегать вложенности `<h1><p>...</p></h1>` — должен быть просто `<p>...</p>`
