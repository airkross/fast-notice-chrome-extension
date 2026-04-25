/**
 * texteditor.js — Rich Text Editor Component
 * v3.2.3: Исправлена замена заголовков при выделении всего текста
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

    // Кнопки форматирования (B, I, S)
    document.querySelectorAll('.pell-button[data-command]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const command = btn.dataset.command;
        
        // Для списков используем отдельную логику
        if (command === 'insertOrderedList' || command === 'insertUnorderedList') {
          document.execCommand(command, false, null);
          this.updateToolbarState();
          this.onChange(this.getContent());
        } else if (command === 'link') {
          this.insertLink();
        } else {
          this.execCommand(command);
        }
      });
    });
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

  setupLinkTooltip() {
    if (!this.linkTooltip) return;

    // Элементы тултипа
    const linkTooltipUrl = document.getElementById('linkTooltipUrl');
    const linkTooltipCopy = document.getElementById('linkTooltipCopy');
    const linkTooltipSave = document.getElementById('linkTooltipSave');
    const linkTooltipDelete = document.getElementById('linkTooltipDelete');

    // Копирование ссылки
    if (linkTooltipCopy) {
      linkTooltipCopy.addEventListener('click', async () => {
        const url = linkTooltipUrl.value;
        try {
          await navigator.clipboard.writeText(url);
          
          // Визуальная обратная связь
          const originalTitle = linkTooltipCopy.title;
          linkTooltipCopy.title = 'Скопировано!';
          setTimeout(() => {
            linkTooltipCopy.title = originalTitle;
          }, 1500);
        } catch (err) {
          console.error('Ошибка копирования:', err);
          linkTooltipUrl.select();
          document.execCommand('copy');
        }
      });
    }

    // Сохранить (обновить ссылку)
    if (linkTooltipSave) {
      linkTooltipSave.addEventListener('click', () => {
        const newUrl = linkTooltipUrl.value;
        if (this.currentLinkElement && newUrl) {
          this.currentLinkElement.href = newUrl;
          this.onChange(this.getContent());
          
          // Визуальная обратная связь
          const originalTitle = linkTooltipSave.title;
          linkTooltipSave.title = 'Сохранено!';
          setTimeout(() => {
            linkTooltipSave.title = originalTitle;
          }, 1500);
        }
      });
    }

    // Удалить ссылку (оставить только текст)
    if (linkTooltipDelete) {
      linkTooltipDelete.addEventListener('click', () => {
        if (this.currentLinkElement) {
          const text = this.currentLinkElement.textContent;
          const parent = this.currentLinkElement.parentNode;
          if (parent) {
            parent.replaceChild(document.createTextNode(text), this.currentLinkElement);
            this.onChange(this.getContent());
          }
          this.hideLinkTooltip();
        }
      });
    }

    // Не скрывать тултип когда мышь над ним
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
        this.hideLinkTooltipWithDelay();
      }
    });

    // Закрытие тултипа при редактировании
    this.editor.addEventListener('input', () => {
      this.hideLinkTooltip();
    });
  }

  hideLinkTooltipWithDelay() {
    if (this.hideTooltipTimeout) {
      clearTimeout(this.hideTooltipTimeout);
    }

    this.hideTooltipTimeout = setTimeout(() => {
      this.hideLinkTooltip();
      this.hideTooltipTimeout = null;
    }, 200);
  }

  showLinkTooltip(linkElement) {
    if (!this.linkTooltip || !this.linkTooltipUrl) return;

    const url = linkElement.href;
    this.linkTooltipUrl.value = url;
    this.currentLinkElement = linkElement;

    this.linkTooltip.classList.remove('hidden');

    const linkRect = linkElement.getBoundingClientRect();
    const tooltipWidth = this.linkTooltip.offsetWidth || 350;
    const tooltipHeight = this.linkTooltip.offsetHeight || 50;

    let left = linkRect.left + (linkRect.width / 2) - (tooltipWidth / 2);
    let top = linkRect.top - tooltipHeight - 10;

    const viewportWidth = window.innerWidth;

    if (left < 10) left = 10;
    if (left + tooltipWidth > viewportWidth - 10) {
      left = viewportWidth - tooltipWidth - 10;
    }
    if (top < 10) {
      top = linkRect.bottom + 10;
    }

    this.linkTooltip.style.position = 'fixed';
    this.linkTooltip.style.left = `${left}px`;
    this.linkTooltip.style.top = `${top}px`;
    this.linkTooltip.style.zIndex = '10000';
  }

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

  setupLinkClickHandler() {
    this.editor.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link || !link.href) return;

      if (e.metaKey || e.ctrlKey || e.altKey) {
        e.preventDefault();
        e.stopPropagation();

        const url = link.href;
        window.open(url, '_blank');
      }
    });

    this.editor.addEventListener('auxclick', (e) => {
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
   * ✅ ИСПРАВЛЕНО v3.2.3: Замена заголовков работает при любом выделении
   * Включая случай когда выделен весь текст (Ctrl+A)
   */
  applyHeading(headingTag) {
    console.log('[TextEditor] applyHeading:', headingTag);

    const selection = window.getSelection();

    if (!selection.rangeCount) {
      console.log('[TextEditor] Нет выделения, formatBlock fallback');
      document.execCommand('formatBlock', false, headingTag);
      this.editor.focus();
      this.updateToolbarState();
      this.onChange(this.getContent());
      return;
    }

    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;

    let element = container.nodeType === Node.TEXT_NODE
      ? container.parentElement
      : container;

    console.log('[TextEditor] Элемент:', element?.tagName, 'id:', element?.id);

    const blockTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'p', 'div'];

    // 🔧 КЛЮЧЕВОЕ ИСПРАВЛЕНИЕ: если мы внутри #textEditor (выделен весь текст),
    // обрабатываем ВСЕ дочерние блочные элементы
    if (element && element.id === 'textEditor') {
      console.log('[TextEditor] Мы внутри #textEditor, обрабатываем всех потомков');

      const blockElements = Array.from(this.editor.children).filter(
        el => blockTags.includes(el.tagName?.toLowerCase())
      );

      console.log('[TextEditor] Найдено блочных элементов:', blockElements.length);

      if (blockElements.length > 0) {
        // Обрабатываем в обратном порядке чтобы не сбились индексы при замене
        for (let i = blockElements.length - 1; i >= 0; i--) {
          const blockElement = blockElements[i];
          const oldTag = blockElement.tagName?.toLowerCase();

          if (oldTag !== headingTag) {
            const content = blockElement.innerHTML;
            const newElement = document.createElement(headingTag);
            newElement.innerHTML = content;
            blockElement.parentNode?.replaceChild(newElement, blockElement);
            console.log('[TextEditor] Заменён:', oldTag, '→', headingTag);
          }
        }

        this.editor.focus();
        this.updateToolbarState();
        this.onChange(this.getContent());
        return;
      } else {
        // Нет блочных элементов - создаём новый с выделенным текстом
        console.log('[TextEditor] Нет блочных элементов, создаём новый');
      }
    }

    // Стандартный поиск блок-элемента вверх по дереву
    let blockElement = null;
    let current = element;

    while (current && current.id !== 'textEditor') {
      if (blockTags.includes(current.tagName?.toLowerCase())) {
        blockElement = current;
        console.log('[TextEditor] Найден блок:', current.tagName);
        break;
      }
      current = current.parentElement;
    }

    if (blockElement) {
      const oldTag = blockElement.tagName?.toLowerCase();

      if (oldTag !== headingTag) {
        const content = blockElement.innerHTML;
        const newElement = document.createElement(headingTag);
        newElement.innerHTML = content;

        blockElement.parentNode?.replaceChild(newElement, blockElement);
        console.log('[TextEditor] Заменён блок:', oldTag, '→', headingTag);

        this.editor.focus();
        this.updateToolbarState();
        this.onChange(this.getContent());
        return;
      }
    }

    // Fallback
    console.log('[TextEditor] formatBlock fallback');
    document.execCommand('formatBlock', false, headingTag);
    this.editor.focus();
    this.updateToolbarState();
    this.onChange(this.getContent());
  }

  insertLink() {
    this.insertLinkWithPrompt('https://');
  }

  // Вставка/редактирование ссылки с кастомным prompt
  insertLinkWithPrompt(defaultUrl = 'https://') {
    const selection = window.getSelection();
    const selectedText = selection.toString();

    let existingLinkElement = null;

    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const parentElement = container.nodeType === Node.TEXT_NODE
        ? container.parentElement
        : container;

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
        document.execCommand('createLink', false, url);
      } else if (existingLinkElement) {
        existingLinkElement.href = url;
        if (existingLinkElement.textContent === defaultUrl) {
          existingLinkElement.textContent = url;
        }
      } else {
        document.execCommand('insertText', false, url);

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

  getHeadingFromSelection() {
    try {
      const selection = window.getSelection();

      if (!selection.rangeCount) return 'p';

      const range = selection.getRangeAt(0);
      let container = range.commonAncestorContainer;

      if (container.nodeType === Node.TEXT_NODE) {
        container = container.parentElement;
      }

      let element = container;
      while (element && element.id !== 'textEditor') {
        const tag = element.tagName?.toLowerCase();

        if (['h1', 'h2', 'h3', 'h4', 'h5', 'p'].includes(tag)) {
          return tag;
        }

        element = element.parentElement;
      }

      const formatBlock = document.queryCommandValue('formatBlock') || 'p';
      const currentTag = formatBlock.toLowerCase().replace(/<|>/g, '');

      const validTags = ['p', 'h1', 'h2', 'h3', 'h4', 'h5'];
      return validTags.includes(currentTag) ? currentTag : 'p';
    } catch (e) {
      console.warn('[TextEditor] Ошибка определения заголовка:', e);
      return 'p';
    }
  }

  updateToolbarState() {
    // Обновляем подсветку кнопок форматирования (B, I, S, U)
    document.querySelectorAll('.pell-button[data-command]').forEach(btn => {
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

    // Обновляем подсветку нумерованного списка
    const olistBtn = document.querySelector('.pell-button[data-command="insertOrderedList"]');
    if (olistBtn) {
      try {
        if (document.queryCommandState('insertOrderedList')) {
          olistBtn.classList.add('active');
        } else {
          olistBtn.classList.remove('active');
        }
      } catch (e) {
        olistBtn.classList.remove('active');
      }
    }

    // Обновляем подсветку маркированного списка
    const ulistBtn = document.querySelector('.pell-button[data-command="insertUnorderedList"]');
    if (ulistBtn) {
      try {
        if (document.queryCommandState('insertUnorderedList')) {
          ulistBtn.classList.add('active');
        } else {
          ulistBtn.classList.remove('active');
        }
      } catch (e) {
        ulistBtn.classList.remove('active');
      }
    }

    const headingSelect = document.getElementById('headingSelect');
    if (headingSelect) {
      const currentTag = this.getHeadingFromSelection();
      headingSelect.value = currentTag;
    }

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
          .replace(/&/g, '&')
          .replace(/</g, '<')
          .replace(/>/g, '>')
        );
        continue;
      }

      line = line
        .replace(/&/g, '&')
        .replace(/</g, '<')
        .replace(/>/g, '>');

      if (!line.trim()) {
        if (inList) {
          processedLines.push(`</${listType}>`);
          inList = false;
        }
        processedLines.push('');
        continue;
      }

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

    result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');
    result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    result = result.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/(?<!<a[^>]*>)\*([^*\n]+)\*(?![^<]*<\/a>)/g, '<em>$1</em>');
    result = result.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');

    return result;
  }

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
                      .replace(/&/g, '&')
                      .replace(/</g, '<')
                      .replace(/>/g, '>')
                      .replace(/"/g, '"')
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
