/**
 * texteditor.test.js — Unit тесты для TextEditor
 * Запуск: npm run test:unit
 */

// ВАЖНО: Моки должны быть ДО импорта TextEditor
beforeAll(() => {
  // Мокаем document.execCommand
  global.document.execCommand = jest.fn(() => true);
  global.document.queryCommandState = jest.fn(() => false);
  global.document.queryCommandValue = jest.fn(() => '');
  
  // Мокаем navigator.clipboard
  global.navigator = {
    clipboard: {
      writeText: jest.fn(() => Promise.resolve()),
    },
  };
});

// Очищаем моки между тестами
beforeEach(() => {
  jest.clearAllMocks();
});

// Импортируем ПОСЛЕ настройки моков
const TextEditor = require('../../texteditor.js');

describe('TextEditor', () => {
  let editorElement;
  let textEditor;
  
  beforeEach(() => {
    editorElement = {
      innerHTML: '',
      innerText: '',
      addEventListener: jest.fn(),
      focus: jest.fn(),
    };
    
    textEditor = new TextEditor(editorElement, {
      format: 'markdown',
      onChange: jest.fn(),
      onFormatChange: jest.fn(),
    });
  });
  
  describe('Инициализация', () => {
    test('должен создаваться с форматом markdown по умолчанию', () => {
      expect(textEditor.getFormat()).toBe('markdown');
    });
    
    test('должен принимать кастомный формат', () => {
      textEditor = new TextEditor(editorElement, { format: 'html' });
      expect(textEditor.getFormat()).toBe('html');
    });
  });
  
  describe('Markdown конвертация', () => {
    test('должен конвертировать заголовки H1-H5 в HTML', () => {
      const markdown = '# Заголовок 1\n## Заголовок 2\n### Заголовок 3';
      const html = textEditor.markdownToHtml(markdown);
      
      expect(html).toContain('<h1>Заголовок 1</h1>');
      expect(html).toContain('<h2>Заголовок 2</h2>');
      expect(html).toContain('<h3>Заголовок 3</h3>');
    });
    
    test('должен конвертировать жирный текст', () => {
      const markdown = '**жирный текст**';
      const html = textEditor.markdownToHtml(markdown);
      
      expect(html).toContain('<strong>жирный текст</strong>');
    });
    
    test('должен конвертировать курсив', () => {
      const markdown = '*курсив*';
      const html = textEditor.markdownToHtml(markdown);
      
      expect(html).toContain('<em>курсив</em>');
    });
    
    test('должен конвертировать зачеркнутый текст', () => {
      const markdown = '~~зачеркнутый~~';
      const html = textEditor.markdownToHtml(markdown);
      
      expect(html).toContain('<s>зачеркнутый</s>');
    });
    
    test('должен конвертировать ссылки с target="_blank"', () => {
      const markdown = '[Google](https://google.com)';
      const html = textEditor.markdownToHtml(markdown);
      
      expect(html).toContain('<a');
      expect(html).toContain('href="https://google.com"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('>Google</a>');
    });
    
    test('должен оборачивать ссылки в параграф', () => {
      const markdown = '[Google](https://google.com)';
      const html = textEditor.markdownToHtml(markdown);
      
      expect(html).toContain('<p>');
      expect(html).toContain('</p>');
    });
    
    test('должен конвертировать HTML обратно в Markdown', () => {
      const html = '<h1>Заголовок</h1><p>Текст</p>';
      const markdown = textEditor.htmlToMarkdown(html);
      
      expect(markdown).toContain('# Заголовок');
    });

    test('должен конвертировать изображение Markdown в HTML', () => {
      const markdown = '![Alt текст](https://example.com/image.png)';
      const html = textEditor.markdownToHtml(markdown);
      expect(html).toContain('<img src="https://example.com/image.png" alt="Alt текст" />');
    });

    test('должен конвертировать блок кода Markdown в HTML', () => {
      const markdown = '```\nconsole.log(1);\n```';
      const html = textEditor.markdownToHtml(markdown);
      expect(html).toContain('<pre><code>console.log(1);</code></pre>');
    });

    test('должен конвертировать HTML изображение обратно в Markdown', () => {
      const html = '<img src="https://example.com/image.png" alt="Alt" />';
      const markdown = textEditor.htmlToMarkdown(html);
      expect(markdown).toContain('![Alt](https://example.com/image.png)');
    });

    test('должен распознавать JSON как JSON', () => {
      expect(textEditor.isJson('{"content":"текст"}')).toBe(true);
    });

    test('не должен распознавать невалидный JSON', () => {
      expect(textEditor.isJson('not json')).toBe(false);
    });

    test('должен вставлять JSON markdown контент', () => {
      const editorElement = { innerHTML: '', addEventListener: jest.fn(), focus: jest.fn() };
      const localEditor = new TextEditor(editorElement, { format: 'markdown' });
      localEditor.insertFromJson(JSON.stringify({ content: '# Привет', format: 'markdown' }));
      expect(document.execCommand).toHaveBeenCalledWith('insertHTML', false, expect.stringContaining('<h1>Привет</h1>'));
    });
  });
  
  describe('Распознавание Markdown', () => {
    test('должен распознавать заголовки как Markdown', () => {
      expect(textEditor.isMarkdown('# Заголовок')).toBe(true);
    });
    
    test('должен распознавать списки как Markdown', () => {
      expect(textEditor.isMarkdown('- элемент списка')).toBe(true);
      expect(textEditor.isMarkdown('1. элемент списка')).toBe(true);
    });
    
    test('должен распознавать жирный текст как Markdown', () => {
      expect(textEditor.isMarkdown('**жирный**')).toBe(true);
    });
    
    test('должен распознавать ссылки как Markdown', () => {
      expect(textEditor.isMarkdown('[текст](url)')).toBe(true);
    });
    
    test('не должен распознавать обычный текст как Markdown', () => {
      expect(textEditor.isMarkdown('Просто текст')).toBe(false);
    });
  });
  
  describe('Управление контентом', () => {
    test('должен устанавливать контент', () => {
      textEditor.setContent('<p>Тест</p>');
      expect(editorElement.innerHTML).toBe('<p>Тест</p>');
    });
    
    test('должен получать контент', () => {
      editorElement.innerHTML = '<p>Тест</p>';
      expect(textEditor.getContent()).toBe('<p>Тест</p>');
    });
    
    test('должен получать текстовое содержимое', () => {
      editorElement.innerText = 'Тестовый текст';
      expect(textEditor.getTextContent()).toBe('Тестовый текст');
    });
  });
  
  describe('Форматирование', () => {
    test('должен менять формат', () => {
      textEditor.setFormat('html');
      expect(textEditor.getFormat()).toBe('html');
    });
    
    test('должен выполнять команды форматирования', () => {
      textEditor.execCommand('bold');
      
      expect(document.execCommand).toHaveBeenCalledWith('bold', false, null);
      expect(editorElement.focus).toHaveBeenCalled();
    });
    
    test('должен применять заголовки', () => {
      textEditor.applyHeading('h1');
      
      expect(document.execCommand).toHaveBeenCalledWith('formatBlock', false, 'h1');
      expect(editorElement.focus).toHaveBeenCalled();
    });
  });
});