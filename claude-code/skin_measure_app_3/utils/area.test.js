/**
 * Unit tests for area.js - Shoelace formula and unit conversion
 */

const {
  shoelaceArea,
  pixelToCm2,
  calibrateRuler
} = require('./area.js');

// Test helper
function assert(condition, message) {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`PASS: ${message}`);
}

// Test shoelaceArea - basic triangle
function testTriangleArea() {
  // Triangle with vertices (0,0), (4,0), (0,3) - area should be 6
  const vertices = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 0, y: 3 }
  ];
  const area = shoelaceArea(vertices);
  assert(Math.abs(area - 6) < 0.001, `Triangle area: expected 6, got ${area}`);
}

// Test shoelaceArea - square
function testSquareArea() {
  // 10x10 square - area should be 100
  const vertices = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 }
  ];
  const area = shoelaceArea(vertices);
  assert(Math.abs(area - 100) < 0.001, `Square area: expected 100, got ${area}`);
}

// Test shoelaceArea - less than 3 points
function testInsufficientVertices() {
  assert(shoelaceArea([]) === 0, 'Empty vertices returns 0');
  assert(shoelaceArea([{ x: 1, y: 1 }]) === 0, 'Single point returns 0');
  assert(shoelaceArea([{ x: 0, y: 0 }, { x: 1, y: 1 }]) === 0, 'Two points returns 0');
}

// Test pixelToCm2 - basic conversion
function testPixelToCm2() {
  // If 1px = 1mm, then 10000px² = 1cm²
  // pixelArea * (mmPerPx)² / 100 = cm²
  // 10000 * (1)² / 100 = 100
  const area = pixelToCm2(10000, 1);
  assert(Math.abs(area - 100) < 0.01, `10000px at 1px/mm: expected 100, got ${area}`);
}

// Test pixelToCm2 - zero/negative pxPerMm
function testPixelToCm2EdgeCases() {
  assert(pixelToCm2(1000, 0) === 0, 'Zero pxPerMm returns 0');
  assert(pixelToCm2(1000, -1) === 0, 'Negative pxPerMm returns 0');
}

// Test calibrateRuler
function testCalibrateRuler() {
  assert(calibrateRuler(100) === 10, '100px / 10mm = 10px/mm');
  assert(calibrateRuler(50) === 5, '50px / 10mm = 5px/mm');
}

// Run all tests
console.log('Running area.js tests...\n');
testTriangleArea();
testSquareArea();
testInsufficientVertices();
testPixelToCm2();
testPixelToCm2EdgeCases();
testCalibrateRuler();
console.log('\nAll tests passed!');