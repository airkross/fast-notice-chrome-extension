const fs = require('fs');
let content = fs.readFileSync('editor.js', 'utf8');

// Исправляем экранирование HTML в formatTabsAsHtml
// Заменяем неправильные сущности на правильные

// Для safeTitle
content = content.replace(
  ".replace(/&/g, '&')\n      .replace(/</g, '<')\n      .replace(/>/g, '>')\n      .replace(/\"/g, '\"');",
  ".replace(/&/g, '&amp;')\n      .replace(/</g, '&lt;')\n      .replace(/>/g, '&gt;')\n      .replace(/\"/g, '&quot;');"
);

// Для safeUrl
content = content.replace(
  ".replace(/&/g, '&')\n      .replace(/</g, '<')\n      .replace(/>/g, '>');",
  ".replace(/&/g, '&amp;')\n      .replace(/</g, '&lt;')\n      .replace(/>/g, '&gt;');"
);

fs.writeFileSync('editor.js', content);
console.log('Done');
