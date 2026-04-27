/**
 * Shoelace formula (Gauss's area formula)
 * Computes area of a polygon given its vertices
 * @param {Array<{x: number, y: number}>} vertices - Array of {x, y} points
 * @returns {number} - Area in square pixels
 */
function shoelaceArea(vertices) {
  if (vertices.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < vertices.length; i++) {
    const j = (i + 1) % vertices.length;
    sum += vertices[i].x * vertices[j].y;
    sum -= vertices[j].x * vertices[i].y;
  }
  return Math.abs(sum / 2);
}

/**
 * Convert pixel area to real area in cm²
 * @param {number} pixelArea - Area in pixels
 * @param {number} pxPerMm - Pixel distance per mm (from ruler calibration)
 * @returns {number} - Area in cm², 2 decimal places
 */
function pixelToCm2(pixelArea, pxPerMm) {
  if (pxPerMm <= 0) return 0;
  const mmPerPx = 1 / pxPerMm;
  const pixelAreaMm2 = pixelArea * mmPerPx * mmPerPx;
  return Math.round(pixelAreaMm2 / 100 * 100) / 100;
}

/**
 * Calculate ruler calibration: pixels per mm
 * @param {number} pixelDistance - Pixel distance between 0mm and 10mm points
 * @returns {number} - Pixels per mm
 */
function calibrateRuler(pixelDistance) {
  return pixelDistance / 10;
}

module.exports = {
  shoelaceArea,
  pixelToCm2,
  calibrateRuler
};