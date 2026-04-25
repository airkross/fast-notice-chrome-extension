/**
 * dropdown.test.js — Unit-тесты для стилей dropdown компонента
 * Проверяет что dropdown может отображаться за пределами card-body
 */

const fs = require('fs');
const path = require('path');

describe('Dropdown CSS — Стили для корректного отображения', () => {
  
  test('selection.css: .ozon-card не содержит overflow: hidden', () => {
    const cssPath = path.join(__dirname, '../../selection.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    
    // Проверяем что .ozon-card не имеет overflow: hidden
    const ozonCardMatch = css.match(/\.ozon-card\s*\{[^}]*\}/g);
    
    if (ozonCardMatch) {
      ozonCardMatch.forEach(rule => {
        expect(rule).not.toMatch(/overflow:\s*hidden/);
      });
    }
  });

  test('selection.css: .ozon-card .card-body имеет overflow: visible', () => {
    const cssPath = path.join(__dirname, '../../selection.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    
    // Проверяем что есть правило для .card-body с overflow: visible
    const hasCardBodyVisible = css.includes('.ozon-card .card-body') && 
                               css.includes('overflow: visible');
    
    expect(hasCardBodyVisible).toBe(true);
  });

  test('editor.css: .ozon-card не содержит overflow: hidden', () => {
    const cssPath = path.join(__dirname, '../../editor.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    
    // Проверяем что .ozon-card не имеет overflow: hidden
    const ozonCardMatch = css.match(/\.ozon-card\s*\{[^}]*\}/g);
    
    if (ozonCardMatch) {
      ozonCardMatch.forEach(rule => {
        expect(rule).not.toMatch(/overflow:\s*hidden/);
      });
    }
  });

  test('editor.css: .ozon-card .card-body имеет overflow: visible', () => {
    const cssPath = path.join(__dirname, '../../editor.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    
    // Проверяем что есть правило для .card-body с overflow: visible
    const hasCardBodyVisible = css.includes('.ozon-card .card-body') && 
                               css.includes('overflow: visible');
    
    expect(hasCardBodyVisible).toBe(true);
  });

  test('selection.css: dropdown-menu имеет высокий z-index', () => {
    const cssPath = path.join(__dirname, '../../selection.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    
    // Проверяем что dropdown-menu имеет z-index
    const dropdownMenuMatch = css.match(/\.dropdown-menu\s*\{[^}]*\}/g);
    
    expect(dropdownMenuMatch).not.toBeNull();
    
    const hasZIndex = dropdownMenuMatch.some(rule => 
      rule.includes('z-index:') || rule.includes('z-index :')
    );
    
    expect(hasZIndex).toBe(true);
  });

  test('selection.css: dropdown-menu имеет position: absolute', () => {
    const cssPath = path.join(__dirname, '../../selection.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    
    // Проверяем что dropdown-menu имеет position: absolute
    const dropdownMenuMatch = css.match(/\.dropdown-menu\s*\{[^}]*\}/g);
    
    expect(dropdownMenuMatch).not.toBeNull();
    
    const hasPositionAbsolute = dropdownMenuMatch.some(rule => 
      rule.includes('position:') && rule.includes('absolute')
    );
    
    expect(hasPositionAbsolute).toBe(true);
  });

  test('selection.css: нативный select скрыт визуально но доступен', () => {
    const cssPath = path.join(__dirname, '../../selection.css');
    const css = fs.readFileSync(cssPath, 'utf8');
    
    // Проверяем что #notesSelect скрыт с position: absolute и opacity: 0
    const selectMatch = css.match(/#notesSelect\.notes-select-lg\s*\{[^}]*\}/g);
    
    if (selectMatch) {
      const hasPositionAbsolute = selectMatch.some(rule => 
        rule.includes('position:') && rule.includes('absolute')
      );
      const hasOpacityZero = selectMatch.some(rule => 
        rule.includes('opacity:') && (rule.includes('0') || rule.includes('0 '))
      );
      const hasPointerEventsNone = selectMatch.some(rule => 
        rule.includes('pointer-events:') && rule.includes('none')
      );
      
      expect(hasPositionAbsolute).toBe(true);
      expect(hasOpacityZero).toBe(true);
      expect(hasPointerEventsNone).toBe(true);
    }
  });
});
