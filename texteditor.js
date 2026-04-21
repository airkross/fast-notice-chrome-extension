/**
 * texteditor.js — Rich Text Editor Component
 * v3.2.2: Исправлено исчезновение тултипа и открытие ссылок с модификаторами
 */

class TextEditor {
  constructor(editorElement, options = {}) {
    this.editor = editorElement;
    this.format = options.format || 'markdown';
    this.onChange = options.onChange || (() => {});
    this.onFormatChange = options.onFormatChange || (() => {});
    
    // Элементы тултипа
    this.linkTooltip = document.getElementById('linkTooltip');
    this.linkTooltipUrl = document.getElementById('linkTooltipUrl');
    this.linkTooltipCopy = document.getElementById('linkTooltipCopy');
    this.linkTooltipClose = document.getElementById('linkTooltipClose');
    this.currentLinkElement = null;
    this.hideTooltipTimeout = null;
    
    this.init();
  }
  
  init() {
    this.setupToolbar();
    this.setupEventListeners();
    this.setupPasteHandler();
    this.setupLinkTooltip();
    this.setupLinkClickHandler();
  }
  
  setupToolbar() {
    // Заголовки
    const headingSelect = document.getElementById('headingSelect');
    if (headingSelect) {
      headingSelect.addEventListener('change', (e) => {
        console.log('[TextEditor] Смена заголовка:', e.target.value);
        this.applyHeading(e.target.value);
      });
    }
    
    // Кнопки форматирования
    document.querySelectorAll('.toolbar-btn[data-command]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const command = btn.dataset.command;
        this.execCommand(command);
        this.updateToolbarState();
      });
    });
    
    // Ссылка
    const linkBtn = document.getElementById('linkBtn');
    if (linkBtn) {
      linkBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.insertLink();
      });
    }
  }
  
  setupEventListeners() {
    this.editor.addEventListener('input', () => {
      this.onChange(this.getContent());
    });
    
    // Обновление состояния при движении курсора
    this.editor.addEventListener('keyup', () => {
      this.updateToolbarState();
    });
    
    this.editor.addEventListener('mouseup', () => {
      this.updateToolbarState();
    });
    
    this.editor.addEventListener('click', () => {
      this.updateToolbarState();
    });
    
    // Горячие клавиши
    this.editor.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch(e.key.toLowerCase()) {
          case 'b':
            e.preventDefault();
            this.execCommand('bold');
            break;
          case 'i':
            e.preventDefault();
            this.execCommand('italic');
            break;
          case 'k':
            e.preventDefault();
            this.insertLink();
            break;
        }
      }
    });
  }
  
  setupPasteHandler() {
    this.editor.addEventListener('paste', (e) => {
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;
      
      const html = clipboardData.getData('text/html');
      const text = clipboardData.getData('text/plain');
      
      // ПРИОРИТЕТ 1: HTML
      if (html && html.trim().length > 0) {
        e.preventDefault();
        const cleanHtml = this.cleanHtml(html);
        document.execCommand('insertHTML', false, cleanHtml);
        this.onChange(this.getContent());
        return;
      }
      
      // ПРИОРИТЕТ 2: JSON
      if (text && text.trim() && this.isJson(text)) {
        e.preventDefault();
        this.insertFromJson(text);
        this.onChange(this.getContent());
        return;
      }
      
      // ПРИОРИТЕТ 3: Markdown
      if (text && text.trim() && this.isMarkdown(text)) {
        e.preventDefault();
        const convertedHtml = this.markdownToHtml(text);
        document.execCommand('insertHTML', false, convertedHtml);
        this.onChange(this.getContent());
        return;
      }
    });
  }
  
  /**
   * ✅ ИСПРАВЛЕНО: Настройка тултипа для ссылок с задержкой скрытия
   */
  setupLinkTooltip() {
    if (!this.linkTooltip) return;
    
    // Копирование ссылки
    this.linkTooltipCopy.addEventListener('click', async () => {
      const url = this.linkTooltipUrl.value;
      try {
        await navigator.clipboard.writeText(url);
        
        const originalText = this.linkTooltipCopy.textContent;
        this.linkTooltipCopy.textContent = '✓ Скопировано';
        this.linkTooltipCopy.style.background = 'var(--success-color)';
        
        setTimeout(() => {
          this.linkTooltipCopy.textContent = originalText;
          this.linkTooltipCopy.style.background = '';
        }, 1500);
      } catch (err) {
        console.error('Ошибка копирования:', err);
        this.linkTooltipUrl.select();
        document.execCommand('copy');
      }
    });
    
    // Закрытие тултипа
    this.linkTooltipClose.addEventListener('click', () => {
      this.hideLinkTooltip();
    });
    
    // ✅ НОВОЕ: Не скрывать тултип когда мышь над ним
    this.linkTooltip.addEventListener('mouseenter', () => {
      if (this.hideTooltipTimeout) {
        clearTimeout(this.hideTooltipTimeout);
        this.hideTooltipTimeout = null;
      }
    });
    
    this.linkTooltip.addEventListener('mouseleave', () => {
      this.hideLinkTooltipWithDelay();
    });
    
    // Закрытие при клике вне тултипа
    document.addEventListener('click', (e) => {
      if (this.linkTooltip && 
          !this.linkTooltip.contains(e.target) && 
          !this.editor.contains(e.target)) {
        this.hideLinkTooltip();
      }
    });
    
    // Показ/скрытие при наведении на ссылки
    this.editor.addEventListener('mouseover', (e) => {
      const link = e.target.closest('a');
      if (link && link.href) {
        // Отменяем предыдущее скрытие
        if (this.hideTooltipTimeout) {
          clearTimeout(this.hideTooltipTimeout);
          this.hideTooltipTimeout = null;
        }
        
        this.currentLinkElement = link;
        this.showLinkTooltip(link);
      }
    });
    
    this.editor.addEventListener('mouseout', (e) => {
      const link = e.target.closest('a');
      if (link && this.currentLinkElement === link) {
        // ✅ НОВОЕ: Скрываем с задержкой, чтобы успеть перейти на тултип
        this.hideLinkTooltipWithDelay();
      }
    });
    
    // Закрытие тултипа при редактировании
    this.editor.addEventListener('input', () => {
      this.hideLinkTooltip();
    });
  }
  
  /**
   * ✅ НОВОЕ: Скрытие тултипа с задержкой
   */
  hideLinkTooltipWithDelay() {
    if (this.hideTooltipTimeout) {
      clearTimeout(this.hideTooltipTimeout);
    }
    
    this.hideTooltipTimeout = setTimeout(() => {
      this.hideLinkTooltip();
      this.hideTooltipTimeout = null;
    }, 200); // 200ms задержка
  }
  
  /**
   * Показ тултипа
   */
  showLinkTooltip(linkElement) {
    if (!this.linkTooltip || !this.linkTooltipUrl) return;
    
    const url = linkElement.href;
    this.linkTooltipUrl.value = url;
    this.currentLinkElement = linkElement;
    
    // Force layout calculation
    this.linkTooltip.classList.remove('hidden');
    
    // Используем getBoundingClientRect для точного позиционирования
    const linkRect = linkElement.getBoundingClientRect();
    
    // Получаем реальные размеры тултипа
    const tooltipWidth = this.linkTooltip.offsetWidth || 350;
    const tooltipHeight = this.linkTooltip.offsetHeight || 50;
    
    // Вычисляем позицию — центрируем относительно ссылки
    let left = linkRect.left + (linkRect.width / 2) - (tooltipWidth / 2);
    let top = linkRect.top - tooltipHeight - 10; // 10px отступ над ссылкой
    
    // Проверяем границы экрана
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Не даём выйти за левую границу
    if (left < 10) left = 10;
    
    // Не даём выйти за правую границу
    if (left + tooltipWidth > viewportWidth - 10) {
      left = viewportWidth - tooltipWidth - 10;
    }
    
    // Если не помещается сверху — показываем снизу
    if (top < 10) {
      top = linkRect.bottom + 10;
    }
    
    // Используем position: fixed для точного позиционирования
    this.linkTooltip.style.position = 'fixed';
    this.linkTooltip.style.left = `${left}px`;
    this.linkTooltip.style.top = `${top}px`;
    this.linkTooltip.style.zIndex = '10000';
  }
  
  /**
   * Скрытие тултипа
   */
  hideLinkTooltip() {
    if (this.hideTooltipTimeout) {
      clearTimeout(this.hideTooltipTimeout);
      this.hideTooltipTimeout = null;
    }
    
    if (this.linkTooltip) {
      this.linkTooltip.classList.add('hidden');
    }
    this.currentLinkElement = null;
  }
  
  /**
   * ✅ НОВОЕ: Обработчик кликов по ссылкам с модификаторами
   */
  setupLinkClickHandler() {
    this.editor.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link || !link.href) return;
      
      // Проверяем модификаторы: Cmd/Ctrl/Alt
      if (e.metaKey || e.ctrlKey || e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        
        const url = link.href;
        
        // Открываем в новой вкладке
        window.open(url, '_blank');
      }
    });
    
    // Также обрабатываем middle click (колесо мыши)
    this.editor.addEventListener('auxclick', (e) => {
      // Button 1 = middle click
      if (e.button !== 1) return;
      
      const link = e.target.closest('a');
      if (!link || !link.href) return;
      
      e.preventDefault();
      e.stopPropagation();
      
      const url = link.href;
      window.open(url, '_blank');
    });
  }
  
  cleanHtml(html) {
    return html
      .replace(/<meta[^>]*>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<o:p[^>]*>[\s\S]*?<\/o:p>/gi, '')
      .replace(/class="[^"]*"/g, '')
      .replace(/style="[^"]*"/g, '')
      .replace(/<!--[\s\S]*?-->/g, '');
  }
  
  isJson(text) {
    if (!text || typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return false;
    
    try {
      const parsed = JSON.parse(trimmed);
      return parsed.content !== undefined;
    } catch {
      return false;
    }
  }
  
  insertFromJson(jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const content = parsed.content || '';
      const sourceFormat = parsed.format || 'markdown';
      
      let html;
      if (sourceFormat === 'markdown') {
        html = this.markdownToHtml(content);
      } else if (sourceFormat === 'html') {
        html = this.cleanHtml(content);
      } else {
        html = this.markdownToHtml(content);
      }
      
      document.execCommand('insertHTML', false, html);
    } catch (err) {
      console.warn('[TextEditor] Ошибка парсинга JSON:', err);
      document.execCommand('insertText', false, jsonText);
    }
  }
  
  isMarkdown(text) {
    if (!text || text.length < 3) return false;
    
    const patterns = [
      /^#{1,6}\s+.+/m,
      /^\s*[-*+]\s+.+/m,
      /^\s*\d+\.\s+.+/m,
      /\*\*.+\*\*/,
      /\*.+\*/,
      /\[.+\]\(.+\)/,
      /`.+`/,
      /^\s*>\s+.+/m,
      /!\[.*\]\(.+\)/,
    ];
    
    const matches = patterns.filter(p => p.test(text));
    const strongPatterns = [
      /^#{1,6}\s+.+/m,
      /^\s*[-*+]\s+.+/m,
      /^\s*\d+\.\s+.+/m,
      /\[.+\]\(.+\)/,
    ];
    const strongMatches = strongPatterns.filter(p => p.test(text));
    
    return matches.length >= 2 || strongMatches.length >= 1;
  }
  
  execCommand(command, value = null) {
    document.execCommand(command, false, value);
    this.editor.focus();
    this.updateToolbarState();
    this.onChange(this.getContent());
  }
  
  /**
   * ✅ ИСПРАВЛЕНО: Правильная замена форматирования без вложения тегов
   * 
   * Алгоритм:
   * 1. Удаляем старый блочный элемент
   * 2. Создаём новый с нужным тегом
   * 3. Сохраняем содержимое
   */
  applyHeading(headingTag) {
    // Логирование для отладки
    if (!window.applyHeadingLogs) window.applyHeadingLogs = [];
    window.applyHeadingLogs.push(`[START] applyHeading("${headingTag}")`);
    console.log('[TextEditor] applyHeading вызвана с тегом:', headingTag);
    
    const selection = window.getSelection();
    
    if (!selection.rangeCount) {
      window.applyHeadingLogs.push(`[BRANCH] rangeCount=0, using formatBlock`);
      console.log('[TextEditor] Нет выделения, используем fallback formatBlock');
      document.execCommand('formatBlock', false, headingTag);
      this.editor.focus();
      this.updateToolbarState();
      this.onChange(this.getContent());
      return;
    }
    
    window.applyHeadingLogs.push(`[BRANCH] rangeCount=${selection.rangeCount}, using DOM replacement`);
    
    try {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      
      let element = container.nodeType === Node.TEXT_NODE 
        ? container.parentElement 
        : container;
      
      window.applyHeadingLogs.push(`[ELEMENT] tagName=${element?.tagName}`);
      console.log('[TextEditor] Текущий элемент:', element?.tagName);
      
      // Ищем ближайший блочный элемент (h1-h5, p, div)
      const blockTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'p', 'div'];
      let blockElement = null;
      let current = element;
      
      while (current && current.id !== 'textEditor') {
        if (blockTags.includes(current.tagName?.toLowerCase())) {
          blockElement = current;
          window.applyHeadingLogs.push(`[FOUND] blockElement=${current.tagName}`);
          console.log('[TextEditor] Найден блочный элемент:', current.tagName);
          break;
        }
        current = current.parentElement;
      }
      
      // Если нашли блочный элемент и нужно его заменить
      if (blockElement) {
        const oldTag = blockElement.tagName?.toLowerCase();
        window.applyHeadingLogs.push(`[TAGS] oldTag=${oldTag}, newTag=${headingTag}`);
        console.log('[TextEditor] oldTag:', oldTag, 'newTag:', headingTag);
        
        // Если тег отличается, создаём новый
        if (oldTag !== headingTag) {
          // Сохраняем содержимое
          const content = blockElement.innerHTML;
          
          // Создаём новый элемент
          const newElement = document.createElement(headingTag);
          newElement.innerHTML = content;
          
          window.applyHeadingLogs.push(`[REPLACE] old=${oldTag} -> new=${headingTag}`);
          console.log('[TextEditor] Заменяем', oldTag, 'на', headingTag);
          
          // Заменяем старый на новый
          const parentNode = blockElement.parentNode;
          window.applyHeadingLogs.push(`[PARENT] parentNode=${parentNode?.id || parentNode?.tagName}`);
          blockElement.parentNode?.replaceChild(newElement, blockElement);
          window.applyHeadingLogs.push(`[AFTER_REPLACE] editorHTML=${this.editor.innerHTML.substring(0, 50)}`);
          
          // Восстанавливаем фокус
          this.editor.focus();
          
          // Обновляем toolbar
          this.updateToolbarState();
          this.onChange(this.getContent());
          return;
        } else {
          window.applyHeadingLogs.push(`[SKIP] oldTag === newTag, no replacement needed`);
        }
      } else {
        window.applyHeadingLogs.push(`[NO_BLOCK] blockElement is null, using fallback`);
      }
      
      window.applyHeadingLogs.push(`[FALLBACK] using formatBlock`);
      console.log('[TextEditor] Используем fallback formatBlock для', headingTag);
      // Fallback
      document.execCommand('formatBlock', false, headingTag);
      this.editor.focus();
      this.updateToolbarState();
      this.onChange(this.getContent());
    } catch (e) {
      window.applyHeadingLogs.push(`[ERROR] ${e.message}`);
      console.warn('[TextEditor] Ошибка при применении заголовка:', e);
      document.execCommand('formatBlock', false, headingTag);
      this.editor.focus();
      this.updateToolbarState();
      this.onChange(this.getContent());
    }
  }
  
  /**
   * Вставка/редактирование ссылки
   */
  insertLink() {
    const selection = window.getSelection();
    const selectedText = selection.toString();
    
    // ПРОВЕРЯЕМ текущую ссылку под курсором
    let existingLinkElement = null;
    let defaultUrl = 'https://';
    
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const parentElement = container.nodeType === Node.TEXT_NODE 
        ? container.parentElement 
        : container;
      
      // Ищем ближайшую ссылку
      existingLinkElement = parentElement?.closest('a');
      
      if (existingLinkElement && existingLinkElement.href) {
        defaultUrl = existingLinkElement.href;
      } else if (selectedText && selectedText.startsWith('http')) {
        defaultUrl = selectedText;
      }
    }
    
    const url = prompt('Введите URL ссылки:', defaultUrl);
    
    if (url && url !== 'https://') {
      if (selectedText) {
        // Текст выделен — создаём/обновляем ссылку
        document.execCommand('createLink', false, url);
      } else if (existingLinkElement) {
        // Мы внутри существующей ссылки — обновляем href
        existingLinkElement.href = url;
        // Если текст ссылки был старым URL — обновляем его
        if (existingLinkElement.textContent === defaultUrl) {
          existingLinkElement.textContent = url;
        }
      } else {
        // Ничего не выделено — вставляем URL как ссылку
        document.execCommand('insertText', false, url);
        
        // Выделяем только что вставленный текст
        if (selection.focusNode && selection.focusNode.nodeType === Node.TEXT_NODE) {
          const offset = selection.focusOffset;
          selection.collapse(selection.focusNode, offset - url.length);
          selection.extend(selection.focusNode, offset);
        }
        
        document.execCommand('createLink', false, url);
      }
      
      this.updateToolbarState();
      this.onChange(this.getContent());
    }
  }
  
  /**
   * ✅ ИСПРАВЛЕНО: Получение текущего заголовка из DOM-элементов
   * Вместо ненадежного queryCommandValue('formatBlock')
   * проходит вверх по дереву DOM до ближайшего заголовка (h1-h5) или параграфа (p)
   */
  getHeadingFromSelection() {
    try {
      const selection = window.getSelection();
      
      if (!selection.rangeCount) return 'p';
      
      const range = selection.getRangeAt(0);
      let container = range.commonAncestorContainer;
      
      // Если это текстовый узел, идём к родительскому элементу
      if (container.nodeType === Node.TEXT_NODE) {
        container = container.parentElement;
      }
      
      // Ищем блочный элемент (h1-h5 или p), поднимаясь вверх по дереву
      let element = container;
      while (element && element.id !== 'textEditor') {
        const tag = element.tagName?.toLowerCase();
        
        if (['h1', 'h2', 'h3', 'h4', 'h5', 'p'].includes(tag)) {
          return tag;
        }
        
        element = element.parentElement;
      }
      
      // Fallback: если не нашли элемент, используем queryCommandValue
      const formatBlock = document.queryCommandValue('formatBlock') || 'p';
      const currentTag = formatBlock.toLowerCase().replace(/<|>/g, '');
      
      const validTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5'];
      return validTags.includes(currentTag) ? currentTag : 'p';
    } catch (e) {
      console.warn('[TextEditor] Ошибка определения заголовка:', e);
      return 'p';
    }
  }

  /**
   * Обновление состояния toolbar
   */
  updateToolbarState() {
    // Обновляем кнопки форматирования
    document.querySelectorAll('.toolbar-btn[data-command]').forEach(btn => {
      const command = btn.dataset.command;
      try {
        if (document.queryCommandState(command)) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      } catch (e) {
        btn.classList.remove('active');
      }
    });
    
    // ✅ Обновление select заголовков — используем новый метод getHeadingFromSelection
    const headingSelect = document.getElementById('headingSelect');
    if (headingSelect) {
      const currentTag = this.getHeadingFromSelection();
      headingSelect.value = currentTag;
    }
    
    // ОБНОВЛЕНИЕ КНОПКИ ССЫЛКИ
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
        } else {
          linkBtn.classList.remove('active');
        }
      } catch (e) {
        console.warn('[TextEditor] Ошибка обновления кнопки ссылки:', e);
        linkBtn.classList.remove('active');
      }
    }
  }
  
  getFormat() {
    return this.format;
  }

  setFormat(format) {
    this.format = format;
    this.onFormatChange(format);
  }

  getContent() {
    return this.editor.innerHTML;
  }
  
  setContent(html) {
    this.editor.innerHTML = html;
  }
  
  // === Markdown → HTML ===
  markdownToHtml(markdown) {
    if (!markdown || !markdown.trim()) return '';
    
    let html = markdown;
    const lines = html.split('\n');
    const processedLines = [];
    
    let inList = false;
    let listType = 'ul';
    let inCodeBlock = false;
    let codeBlockContent = [];
    
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      
      // Code blocks
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          processedLines.push(`<pre><code>${codeBlockContent.join('\n')}</code></pre>`);
          codeBlockContent = [];
          inCodeBlock = false;
        } else {
          inCodeBlock = true;
        }
        continue;
      }
      
      if (inCodeBlock) {
        codeBlockContent.push(line
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
        );
        continue;
      }
      
      line = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      
      // Пустая строка
      if (!line.trim()) {
        if (inList) {
          processedLines.push(`</${listType}>`);
          inList = false;
        }
        processedLines.push('');
        continue;
      }
      
      // Заголовки
      const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
      if (headingMatch) {
        if (inList) {
          processedLines.push(`</${listType}>`);
          inList = false;
        }
        const level = headingMatch[1].length;
        const text = this.processInlineMarkdown(headingMatch[2]);
        processedLines.push(`<h${level}>${text}</h${level}>`);
        continue;
      }
      
      // Маркированные списки
      const ulMatch = line.match(/^\s*[-*+]\s+(.+)$/);
      if (ulMatch) {
        if (!inList || listType !== 'ul') {
          if (inList) processedLines.push(`</${listType}>`);
          processedLines.push('<ul>');
          inList = true;
          listType = 'ul';
        }
        const text = this.processInlineMarkdown(ulMatch[1]);
        processedLines.push(`<li>${text}</li>`);
        continue;
      }
      
      // Нумерованные списки
      const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
      if (olMatch) {
        if (!inList || listType !== 'ol') {
          if (inList) processedLines.push(`</${listType}>`);
          processedLines.push('<ol>');
          inList = true;
          listType = 'ol';
        }
        const text = this.processInlineMarkdown(olMatch[1]);
        processedLines.push(`<li>${text}</li>`);
        continue;
      }
      
      // Цитаты
      const bqMatch = line.match(/^>\s*(.+)$/);
      if (bqMatch) {
        if (inList) {
          processedLines.push(`</${listType}>`);
          inList = false;
        }
        const text = this.processInlineMarkdown(bqMatch[1]);
        processedLines.push(`<blockquote>${text}</blockquote>`);
        continue;
      }
      
      // Обычные строки
      if (inList) {
        processedLines.push(`</${listType}>`);
        inList = false;
      }
      
      const inlineText = this.processInlineMarkdown(line);
      
      if (inlineText.trim()) {
        const trimmed = inlineText.trim();
        const isBlockTag = /^(<h[1-5]|<ul|<ol|<blockquote|<pre|<img|<table|<div|<p)/i.test(trimmed);
        if (!isBlockTag) {
          processedLines.push(`<p>${inlineText}</p>`);
        } else {
          processedLines.push(inlineText);
        }
      } else {
        processedLines.push(inlineText);
      }
    }
    
    if (inList) {
      processedLines.push(`</${listType}>`);
    }
    
    if (inCodeBlock && codeBlockContent.length > 0) {
      processedLines.push(`<pre><code>${codeBlockContent.join('\n')}</code></pre>`);
    }
    
    html = processedLines.join('\n');
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p>\s*(<h[1-5]>)/g, '$1');
    html = html.replace(/(<\/h[1-5]>)\s*<\/p>/g, '$1');
    
    return html.trim();
  }
  
  processInlineMarkdown(text) {
    let result = text;
    
    // 1. Изображения
    result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
    
    // 2. Ссылки
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    
    // 3. Код
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // 4. Жирный
    result = result.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    
    // 5. Курсив
    result = result.replace(/(?<!<a[^>]*>)\*([^*\n]+)\*(?![^<]*<\/a>)/g, '<em>$1</em>');
    
    // 6. Зачеркнутый
    result = result.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    
    return result;
  }
  
  // === HTML → Markdown ===
  htmlToMarkdown(html) {
    if (!html) return '';
    
    let markdown = html;
    
    markdown = markdown.replace(/>\s+</g, '><');
    markdown = markdown.replace(/<pre><code>([\s\S]*?)<\/code><\/pre>/gi, '```\n$1\n```');
    markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*\/?>/gi, '![$2]($1)');
    markdown = markdown.replace(/<img[^>]*src="([^"]*)"[^>]*\/?>/gi, '![]($1)');
    markdown = markdown.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');
    markdown = markdown.replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**');
    markdown = markdown.replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**');
    markdown = markdown.replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*');
    markdown = markdown.replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*');
    markdown = markdown.replace(/<s[^>]*>(.*?)<\/s>/gi, '~~$1~~');
    markdown = markdown.replace(/<strike[^>]*>(.*?)<\/strike>/gi, '~~$1~~');
    markdown = markdown.replace(/<del[^>]*>(.*?)<\/del>/gi, '~~$1~~');
    markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`');
    markdown = markdown.replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n');
    markdown = markdown.replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n');
    markdown = markdown.replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n');
    markdown = markdown.replace(/<h4[^>]*>(.*?)<\/h4>/gi, '#### $1\n\n');
    markdown = markdown.replace(/<h5[^>]*>(.*?)<\/h5>/gi, '##### $1\n\n');
    markdown = markdown.replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n');
    markdown = markdown.replace(/<ul[^>]*>(.*?)<\/ul>/gis, (match, content) => {
      return content.replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n').trim() + '\n\n';
    });
    markdown = markdown.replace(/<ol[^>]*>(.*?)<\/ol>/gis, (match, content) => {
      let counter = 1;
      return content.replace(/<li[^>]*>(.*?)<\/li>/gi, () => `${counter++}. $1\n`).trim() + '\n\n';
    });
    markdown = markdown.replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n');
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
    markdown = markdown.replace(/<[^>]+>/g, '');
    markdown = markdown.replace(/&nbsp;/g, ' ')
                      .replace(/&amp;/g, '&')
                      .replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&quot;/g, '"')
                      .replace(/&#39;/g, "'");
    markdown = markdown.replace(/\n{3,}/g, '\n\n');
    markdown = markdown.trim();
    
    return markdown;
  }
  
  getTextContent() {
    return this.editor.innerText;
  }
  
  getHtmlContent() {
    return this.editor.innerHTML;
  }
}

// Экспорт для тестов
if (typeof module !== 'undefined' && module.exports) {
  module.exports = TextEditor;
}

// Глобальная переменная для editor.js
window.TextEditor = TextEditor;