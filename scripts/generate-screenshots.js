/**
 * scripts/generate-screenshots.js
 * 
 * Генерирует baseline скриншоты для визуального тестирования
 * Запускается с флагом --update-screenshots для обновления базовых изображений
 * 
 * Usage:
 *   node scripts/generate-screenshots.js        # Dry run - покажет что изменится
 *   node scripts/generate-screenshots.js --update  # Обновит baseline
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'tests', 'e2e', 'screenshots', 'baseline');

console.log('📸 Генерация baseline скриншотов\n');
console.log('Директория:', SCREENSHOTS_DIR);

// Проверяем существование директории
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  console.log('✅ Создана директория для скриншотов');
}

const isUpdate = process.argv.includes('--update');

if (isUpdate) {
  console.log('\n🔄 Режим обновления baseline скриншотов...\n');
  
  // Запускаем visual тесты с флагом --update-snapshots
  try {
    execSync('npx playwright test visual.spec.js --update-snapshots', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit'
    });
    console.log('\n✅ Baseline скриншоты обновлены!');
  } catch (e) {
    console.error('\n❌ Ошибка при генерации скриншотов:', e.message);
    process.exit(1);
  }
} else {
  console.log('\nℹ️  Для генерации/обновления baseline скриншотов запустите:');
  console.log('   node scripts/generate-screenshots.js --update\n');
  
  // Показываем текущие скриншоты
  const files = fs.readdirSync(SCREENSHOTS_DIR);
  console.log('Текущие baseline скриншоты:');
  if (files.length === 0) {
    console.log('  (нет скриншотов - директория пуста)');
  } else {
    files.forEach(f => console.log('  -', f));
  }
  
  console.log('\n📋 Доступные тесты визуального регресса:');
  console.log('  - Editor пустой');
  console.log('  - Editor с контентом');
  console.log('  - Editor с заголовками h1-h5');
  console.log('  - Editor темная тема');
  console.log('  - Selection страница');
  console.log('  - Selection темная тема');
  console.log('  - Selection пустой список');
  console.log('  - Editor heading Select открыт');
  console.log('  - Editor notes Select открыт');
}
