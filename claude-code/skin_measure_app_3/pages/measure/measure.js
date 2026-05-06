Page({
  data: {
    step: 1,
    imagePath: '',
    imageWidth: 0,
    imageHeight: 0,
    calibrationTarget: '0mm',
    calibrationDone: false,
    rulerPoint1: null,
    rulerPoint2: null,
    pxPerMm: 0,
    mmPerPxStr: '',
    vertices: [],
    previewArea: '',
    resultArea: '',
    measureTime: '',
    savedRecordId: '',
    // 缩放和拖动状态
    calibrationScale: 1,
    calibrationOffsetX: 0,
    calibrationOffsetY: 0,
    polygonScale: 1,
    polygonOffsetX: 0,
    polygonOffsetY: 0,
    // 触控状态
    lastTouchDistance: 0,
    lastTouchX: 0,
    lastTouchY: 0,
    isPinching: false,
    // 拖动编辑状态
    editingPoint: null,
    dragStartX: 0,
    dragStartY: 0,
    // 自动识别状态
    isDetecting: false,
    detectionProgress: ''
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.getImageInfo({
          src: tempFilePath,
          success: (info) => {
            this.setData({
              imagePath: tempFilePath,
              imageWidth: info.width,
              imageHeight: info.height
            });
          }
        });
      }
    });
  },

  confirmImage() {
    if (!this.data.imagePath) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }
    this.setData({ step: 2 });
    this.initCalibrationCanvas();
  },

  // ============ Step 2: 比例尺标定 ============

  initCalibrationCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#calibrationCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        const screenWidth = wx.getSystemInfoSync().screenWidth;
        const canvasW = screenWidth - 32;
        const canvasH = wx.getSystemInfoSync().screenHeight * 0.55;
        canvas.width = canvasW * dpr;
        canvas.height = canvasH * dpr;
        ctx.scale(dpr, dpr);

        this.setData({
          calibrationCanvasW: canvasW,
          calibrationCanvasH: canvasH,
          calibrationScale: 1,
          calibrationOffsetX: 0,
          calibrationOffsetY: 0
        });

        const img = canvas.createImage();
        img.src = this.data.imagePath;
        img.onload = () => {
          const scale = Math.min(canvasW / img.width, canvasH / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const offsetX = (canvasW - drawW) / 2;
          const offsetY = (canvasH - drawH) / 2;
          this.canvasData = { canvas, ctx, dpr, drawW, drawH, origOffsetX: offsetX, origOffsetY: offsetY, origScale: scale, img };
          this.redrawCalibration();
        };
        img.onerror = () => {
          wx.showToast({ title: '图片加载失败', icon: 'none' });
        };
      });
  },

  // 自动检测比例尺
  autoDetectRuler() {
    if (this.data.isDetecting) return;

    this.setData({ isDetecting: true, detectionProgress: '正在分析图片...' });

    const { canvas, ctx, dpr, drawW, drawH, origOffsetX, origOffsetY, origScale, img } = this.canvasData;
    const canvasW = this.data.calibrationCanvasW;
    const canvasH = this.data.calibrationCanvasH;

    // 获取图片像素数据
    const imageData = ctx.getImageData(0, 0, canvasW, canvasH);
    const data = imageData.data;

    // 查找水平标尺线（比例尺通常是水平放置的）
    const rulerY = this.findRulerLine(data, canvasW, canvasH);

    if (rulerY > 0) {
      // 找到标尺线，查找0mm和10mm刻度
      const points = this.findRulerMarks(data, canvasW, canvasH, rulerY);

      if (points.mark0 && points.mark10) {
        // 转换为图片坐标
        const p0 = { x: (points.mark0 - origOffsetX) / origScale, y: (rulerY - origOffsetY) / origScale };
        const p10 = { x: (points.mark10 - origOffsetX) / origScale, y: (rulerY - origOffsetY) / origScale };

        this.setData({
          rulerPoint1: p0,
          rulerPoint2: p10,
          calibrationDone: true,
          pxPerMm: points.pxPerMm,
          mmPerPxStr: (1 / points.pxPerMm).toFixed(4)
        });

        wx.showToast({ title: '自动识别成功', icon: 'success' });
      } else {
        wx.showToast({ title: '未能识别比例尺，请手动标定', icon: 'none' });
      }
    } else {
      wx.showToast({ title: '未能识别比例尺，请手动标定', icon: 'none' });
    }

    this.setData({ isDetecting: false, detectionProgress: '' });
    this.redrawCalibration();
  },

  // 查找标尺线（水平方向最密集的线条）
  findRulerLine(data, width, height) {
    const gray = new Uint8Array(width * height);

    // 转灰度图
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      gray[i] = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) | 0;
    }

    // 查找水平边缘（检测显著的水平和垂直线）
    const rowDensity = new Float32Array(height);

    for (let y = 10; y < height - 10; y++) {
      let edgeCount = 0;
      for (let x = 10; x < width - 10; x++) {
        const idx = y * width + x;
        // 水平边缘
        if (x > 0 && x < width - 1) {
          const diff = Math.abs(gray[idx] - gray[idx - 1]);
          if (diff > 30) edgeCount++;
        }
      }
      rowDensity[y] = edgeCount;
    }

    // 找到边缘最密集的行（可能是标尺位置）
    let maxDensity = 0;
    let rulerY = -1;

    for (let y = height * 0.3; y < height * 0.7; y++) {
      // 检测区域密度
      let regionDensity = 0;
      for (let dy = -20; dy <= 20; dy++) {
        const ny = Math.floor(y + dy);
        if (ny >= 0 && ny < height) {
          regionDensity += rowDensity[ny];
        }
      }
      if (regionDensity > maxDensity) {
        maxDensity = regionDensity;
        rulerY = y;
      }
    }

    return rulerY;
  },

  // 查找比例尺刻度
  findRulerMarks(data, width, height, rulerY) {
    const gray = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      gray[i] = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) | 0;
    }

    // 在标尺线附近查找垂直刻度线
    const marks = [];
    const searchRange = 30;

    for (let x = width * 0.2; x < width * 0.8; x++) {
      // 检查是否是垂直刻度线
      let isMark = true;
      for (let dy = -searchRange; dy <= searchRange; dy++) {
        const ny = Math.floor(rulerY + dy);
        if (ny >= 0 && ny < height) {
          const idx = ny * width + Math.floor(x);
          const leftIdx = ny * width + Math.floor(x - 2);
          const rightIdx = ny * width + Math.floor(x + 2);

          if (leftIdx >= 0 && rightIdx < width * height) {
            const center = gray[idx];
            const left = gray[leftIdx];
            const right = gray[rightIdx];

            // 刻度线应该是颜色突变的地方
            if (Math.abs(center - left) < 20 || Math.abs(center - right) < 20) {
              isMark = false;
              break;
            }
          }
        }
      }

      if (isMark) {
        marks.push(x);
      }
    }

    // 简化：假设标尺上有多个刻度，找到第一个（0mm）和第11个（10mm，假设1mm间隔）
    if (marks.length >= 11) {
      // 取前11个刻度
      const first10marks = marks.slice(0, 11);
      const pxPerMark = (first10marks[10] - first10marks[0]) / 10;

      return {
        mark0: first10marks[0],
        mark10: first10marks[10],
        pxPerMm: pxPerMark / 10  // 每10mm的像素 / 10 = 每mm的像素
      };
    }

    // 备选方案：找不到足够刻度时，使用图像边缘检测
    return this.findRulerByEdgeScan(data, width, height, rulerY);
  },

  // 备选：边缘扫描检测
  findRulerByEdgeScan(data, width, height, rulerY) {
    const gray = new Uint8Array(width * height);

    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      gray[i] = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) | 0;
    }

    // 查找从左到右的颜色变化（标尺刻度）
    let lastGray = gray[Math.floor(rulerY) * width];
    let transitions = [];

    for (let x = 1; x < width - 1; x++) {
      const current = gray[Math.floor(rulerY) * width + x];
      if (Math.abs(current - lastGray) > 40) {
        transitions.push(x);
        lastGray = current;
      }
    }

    if (transitions.length >= 2) {
      // 取第一个和最后一个作为0和10的近似位置
      return {
        mark0: transitions[0],
        mark10: transitions[transitions.length - 1],
        pxPerMm: (transitions[transitions.length - 1] - transitions[0]) / 10
      };
    }

    return null;
  },

  zoomInCalibration() {
    const newScale = Math.min(this.data.calibrationScale + 0.25, 3);
    this.setData({ calibrationScale: newScale });
    this.redrawCalibration();
  },

  zoomOutCalibration() {
    const newScale = Math.max(this.data.calibrationScale - 0.25, 0.5);
    this.setData({ calibrationScale: newScale });
    this.redrawCalibration();
  },

  onCalibrationTouchStart(e) {
    const touches = e.touches;
    if (touches.length === 2) {
      const dx = touches[0].x - touches[1].x;
      const dy = touches[0].y - touches[1].y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      this.setData({
        lastTouchDistance: distance,
        isPinching: true
      });
    } else if (touches.length === 1) {
      const touch = touches[0];
      const hitPoint = this.checkHitPoint(touch.x, touch.y, 'calibration');
      if (hitPoint) {
        this.setData({
          editingPoint: hitPoint,
          dragStartX: touch.x,
          dragStartY: touch.y
        });
      } else {
        this.setData({
          lastTouchX: touch.x,
          lastTouchY: touch.y,
          editingPoint: null
        });
      }
    }
  },

  onCalibrationTouchMove(e) {
    const touches = e.touches;
    if (this.data.editingPoint) {
      const touch = touches[0];
      const dx = touch.x - this.data.dragStartX;
      const dy = touch.y - this.data.dragStartY;
      this.dragPoint(dx, dy, 'calibration');
      this.setData({
        dragStartX: touch.x,
        dragStartY: touch.y
      });
    } else if (touches.length === 2 && this.data.isPinching) {
      const dx = touches[0].x - touches[1].x;
      const dy = touches[0].y - touches[1].y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const delta = distance - this.data.lastTouchDistance;
      let newScale = this.data.calibrationScale + delta * 0.005;
      newScale = Math.max(0.5, Math.min(3, newScale));
      this.setData({ calibrationScale: newScale });
      this.redrawCalibration();
      this.setData({ lastTouchDistance: distance });
    } else if (touches.length === 1 && !this.data.isPinching && !this.data.editingPoint) {
      const dx = touches[0].x - this.data.lastTouchX;
      const dy = touches[0].y - this.data.lastTouchY;
      this.setData({
        calibrationOffsetX: this.data.calibrationOffsetX + dx,
        calibrationOffsetY: this.data.calibrationOffsetY + dy,
        lastTouchX: touches[0].x,
        lastTouchY: touches[0].y
      });
      this.redrawCalibration();
    }
  },

  onCalibrationTouchEnd(e) {
    this.setData({ isPinching: false, editingPoint: null });
  },

  checkHitPoint(touchX, touchY, type) {
    const hitRadius = 30;
    const { offsetX, offsetY, scale } = this.currentDraw || { offsetX: 0, offsetY: 0, scale: 1 };
    const { origOffsetX, origOffsetY, origScale } = type === 'calibration' ? this.canvasData : this.polyData;

    if (type === 'calibration') {
      if (this.data.rulerPoint1) {
        const p1 = this.data.rulerPoint1;
        const sx = offsetX + p1.x * origScale * scale;
        const sy = offsetY + p1.y * origScale * scale;
        if (Math.abs(touchX - sx) < hitRadius && Math.abs(touchY - sy) < hitRadius) {
          return { x: p1.x, y: p1.y, type: 'ruler1' };
        }
      }
      if (this.data.rulerPoint2) {
        const p2 = this.data.rulerPoint2;
        const sx = offsetX + p2.x * origScale * scale;
        const sy = offsetY + p2.y * origScale * scale;
        if (Math.abs(touchX - sx) < hitRadius && Math.abs(touchY - sy) < hitRadius) {
          return { x: p2.x, y: p2.y, type: 'ruler2' };
        }
      }
    } else {
      for (let i = 0; i < this.data.vertices.length; i++) {
        const v = this.data.vertices[i];
        const sx = offsetX + v.x * origScale * scale;
        const sy = offsetY + v.y * origScale * scale;
        if (Math.abs(touchX - sx) < hitRadius && Math.abs(touchY - sy) < hitRadius) {
          return { x: v.x, y: v.y, type: 'vertex', index: i };
        }
      }
    }
    return null;
  },

  dragPoint(dx, dy, type) {
    const dataKey = type === 'calibration' ? 'calibrationScale' : 'polygonScale';
    const origScale = type === 'calibration' ? this.canvasData.origScale : this.polyData.origScale;
    const scale = this.data[dataKey];
    const imgDx = dx / (scale * origScale);
    const imgDy = dy / (scale * origScale);

    const editing = this.data.editingPoint;
    if (!editing) return;

    if (type === 'calibration') {
      if (editing.type === 'ruler1') {
        const newPoint = { x: editing.x + imgDx, y: editing.y + imgDy };
        this.setData({ rulerPoint1: newPoint });
        this.setData({ editingPoint: { ...newPoint, type: 'ruler1' } });
        this.redrawCalibration();
      } else if (editing.type === 'ruler2') {
        const newPoint = { x: editing.x + imgDx, y: editing.y + imgDy };
        this.setData({ rulerPoint2: newPoint });
        this.setData({ editingPoint: { ...newPoint, type: 'ruler2' } });
        this.recalcCalibration();
      }
    } else {
      if (editing.type === 'vertex') {
        const newVertices = [...this.data.vertices];
        newVertices[editing.index] = { x: editing.x + imgDx, y: editing.y + imgDy };
        this.setData({ vertices: newVertices });
        this.setData({ editingPoint: { ...newVertices[editing.index], type: 'vertex', index: editing.index } });
        this.redrawPolygon();
        this.updatePreviewArea();
      }
    }
  },

  recalcCalibration() {
    const p1 = this.data.rulerPoint1;
    const p2 = this.data.rulerPoint2;
    if (!p1 || !p2) return;
    const pixelDistance = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    const pxPerMm = pixelDistance / 10;
    const mmPerPx = (1 / pxPerMm).toFixed(4);
    this.setData({
      pxPerMm,
      mmPerPxStr: mmPerPx
    });
  },

  redrawCalibration() {
    if (!this.canvasData) return;
    const { canvas, ctx, dpr, drawW, drawH, origOffsetX, origOffsetY, origScale, img } = this.canvasData;
    const canvasW = this.data.calibrationCanvasW;
    const canvasH = this.data.calibrationCanvasH;
    const scale = this.data.calibrationScale;
    const offsetX = origOffsetX + this.data.calibrationOffsetX;
    const offsetY = origOffsetY + this.data.calibrationOffsetY;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, offsetX, offsetY, drawW * scale, drawH * scale);

    if (this.data.rulerPoint1) {
      const p1 = this.data.rulerPoint1;
      const screenX = offsetX + p1.x * origScale * scale;
      const screenY = offsetY + p1.y * origScale * scale;
      this.drawPoint(ctx, screenX, screenY, '0mm', this.data.editingPoint?.type === 'ruler1');
    }

    if (this.data.rulerPoint2) {
      const p2 = this.data.rulerPoint2;
      const screenX = offsetX + p2.x * origScale * scale;
      const screenY = offsetY + p2.y * origScale * scale;
      this.drawPoint(ctx, screenX, screenY, '10mm', this.data.editingPoint?.type === 'ruler2');
    }

    if (this.data.rulerPoint1 && this.data.rulerPoint2) {
      const p1 = this.data.rulerPoint1;
      const p2 = this.data.rulerPoint2;
      ctx.save();
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(offsetX + p1.x * origScale * scale, offsetY + p1.y * origScale * scale);
      ctx.lineTo(offsetX + p2.x * origScale * scale, offsetY + p2.y * origScale * scale);
      ctx.stroke();
      ctx.restore();
    }

    this.currentDraw = { offsetX, offsetY, scale };
  },

  drawPoint(ctx, x, y, label, isEditing) {
    ctx.save();
    ctx.fillStyle = '#ff3b30';
    ctx.strokeStyle = '#ff3b30';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(x, y, isEditing ? 18 : 12, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = isEditing ? 'rgba(255,59,48,0.4)' : 'rgba(255,59,48,0.2)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ff3b30';
    ctx.fill();

    if (label) {
      ctx.font = 'bold 22px sans-serif';
      ctx.fillStyle = '#ff3b30';
      const textWidth = ctx.measureText(label).width;
      ctx.fillText(label, x - textWidth/2, y - 25);
    }

    ctx.restore();
  },

  onCalibrationTap(e) {
    if (this.data.calibrationDone) return;
    const { x, y } = e.detail;
    const { offsetX, offsetY, scale } = this.currentDraw || { offsetX: 0, offsetY: 0, scale: 1 };
    const { origOffsetX, origOffsetY, origScale } = this.canvasData;

    const imgX = (x - offsetX) / (origScale * scale);
    const imgY = (y - offsetY) / (origScale * scale);

    if (this.data.calibrationTarget === '0mm') {
      this.setData({
        calibrationTarget: '10mm',
        rulerPoint1: { x: imgX, y: imgY },
        editingPoint: { x: imgX, y: imgY, type: 'ruler1' }
      });
      this.redrawCalibration();
    } else {
      const point2 = { x: imgX, y: imgY };
      const p1 = this.data.rulerPoint1;
      const pixelDistance = Math.sqrt((point2.x - p1.x) ** 2 + (point2.y - p1.y) ** 2);
      const pxPerMm = pixelDistance / 10;
      const mmPerPx = (1 / pxPerMm).toFixed(4);
      this.setData({
        calibrationTarget: '0mm',
        rulerPoint2: point2,
        pxPerMm,
        mmPerPxStr: mmPerPx,
        calibrationDone: true,
        editingPoint: { x: imgX, y: imgY, type: 'ruler2' }
      });
      this.redrawCalibration();
    }
  },

  resetCalibration() {
    this.setData({
      calibrationTarget: '0mm',
      rulerPoint1: null,
      rulerPoint2: null,
      pxPerMm: 0,
      mmPerPxStr: '',
      calibrationDone: false,
      calibrationScale: 1,
      calibrationOffsetX: 0,
      calibrationOffsetY: 0,
      editingPoint: null
    });
    this.initCalibrationCanvas();
  },

  confirmCalibration() {
    if (!this.data.rulerPoint1 || !this.data.rulerPoint2) {
      wx.showToast({ title: '请先标定比例尺', icon: 'none' });
      return;
    }
    this.setData({ step: 3, editingPoint: null });
    this.initPolygonCanvas();
  },

  // ============ Step 3: 病变区域描画 ============

  initPolygonCanvas() {
    const query = wx.createSelectorQuery();
    query.select('#polygonCanvas')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        const canvas = res[0].node;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        const screenWidth = wx.getSystemInfoSync().screenWidth;
        const canvasW = screenWidth - 32;
        const canvasH = wx.getSystemInfoSync().screenHeight * 0.55;
        canvas.width = canvasW * dpr;
        canvas.height = canvasH * dpr;
        ctx.scale(dpr, dpr);

        this.setData({
          polygonCanvasW: canvasW,
          polygonCanvasH: canvasH,
          polygonScale: 1,
          polygonOffsetX: 0,
          polygonOffsetY: 0
        });

        const img = canvas.createImage();
        img.src = this.data.imagePath;
        img.onload = () => {
          const scale = Math.min(canvasW / img.width, canvasH / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const offsetX = (canvasW - drawW) / 2;
          const offsetY = (canvasH - drawH) / 2;
          this.polyData = { canvas, ctx, dpr, drawW, drawH, origOffsetX: offsetX, origOffsetY: offsetY, origScale: scale, img };
          this.redrawPolygon();
        };
        img.onerror = () => {
          wx.showToast({ title: '图片加载失败', icon: 'none' });
        };
      });
  },

  // 自动检测病变轮廓
  autoDetectContour() {
    if (this.data.isDetecting) return;

    this.setData({ isDetecting: true, detectionProgress: '正在检测边缘...' });

    const { canvas, ctx, dpr, drawW, drawH, origOffsetX, origOffsetY, origScale, img } = this.polyData;
    const canvasW = this.data.polygonCanvasW;
    const canvasH = this.data.polygonCanvasH;

    const imageData = ctx.getImageData(0, 0, canvasW, canvasH);
    const data = imageData.data;

    // 使用边缘检测查找轮廓
    const contour = this.findContour(data, canvasW, canvasH);

    if (contour && contour.length >= 3) {
      // 转换为图片坐标
      const imgVertices = contour.map(p => ({
        x: (p.x - origOffsetX) / origScale,
        y: (p.y - origOffsetY) / origScale
      }));

      this.setData({ vertices: imgVertices });
      wx.showToast({ title: '自动识别成功', icon: 'success' });
    } else {
      wx.showToast({ title: '未能识别轮廓，请手动绘制', icon: 'none' });
    }

    this.setData({ isDetecting: false, detectionProgress: '' });
    this.redrawPolygon();
    this.updatePreviewArea();
  },

  // 边缘检测找轮廓
  findContour(data, width, height) {
    const gray = new Uint8Array(width * height);

    // 转灰度图
    for (let i = 0; i < width * height; i++) {
      const idx = i * 4;
      gray[i] = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) | 0;
    }

    // 简单边缘检测 (Sobel简化版)
    const edges = new Uint8Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const gx = Math.abs(gray[idx + 1] - gray[idx - 1]);
        const gy = Math.abs(gray[idx + width] - gray[idx - width]);
        edges[idx] = Math.sqrt(gx * gx + gy * gy) | 0;
      }
    }

    // 从中心向外搜索找到封闭轮廓
    const centerX = width / 2;
    const centerY = height / 2;

    // 简单方法：查找与中心连线的边缘点
    const contourPoints = [];
    const step = 20; // 每隔20度采样一个点

    for (let angle = 0; angle < 360; angle += step) {
      const rad = angle * Math.PI / 180;
      const dx = Math.cos(rad);
      const dy = Math.sin(rad);

      for (let dist = 0; dist < Math.min(width, height) / 2; dist += 2) {
        const x = Math.floor(centerX + dx * dist);
        const y = Math.floor(centerY + dy * dist);

        if (x < 1 || x >= width - 1 || y < 1 || y >= height - 1) break;

        const edgeIdx = y * width + x;
        if (edges[edgeIdx] > 30) {
          contourPoints.push({ x, y });
          break;
        }
      }
    }

    return contourPoints.length >= 3 ? contourPoints : null;
  },

  zoomInPolygon() {
    const newScale = Math.min(this.data.polygonScale + 0.25, 3);
    this.setData({ polygonScale: newScale });
    this.redrawPolygon();
  },

  zoomOutPolygon() {
    const newScale = Math.max(this.data.polygonScale - 0.25, 0.5);
    this.setData({ polygonScale: newScale });
    this.redrawPolygon();
  },

  onPolygonTouchStart(e) {
    const touches = e.touches;
    if (touches.length === 2) {
      const dx = touches[0].x - touches[1].x;
      const dy = touches[0].y - touches[1].y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      this.setData({
        lastTouchDistance: distance,
        isPinching: true
      });
    } else if (touches.length === 1) {
      const touch = touches[0];
      const hitPoint = this.checkHitPoint(touch.x, touch.y, 'polygon');
      if (hitPoint) {
        this.setData({
          editingPoint: hitPoint,
          dragStartX: touch.x,
          dragStartY: touch.y
        });
      } else {
        this.setData({
          lastTouchX: touch.x,
          lastTouchY: touch.y,
          editingPoint: null
        });
      }
    }
  },

  onPolygonTouchMove(e) {
    const touches = e.touches;
    if (this.data.editingPoint && this.data.editingPoint.type === 'vertex') {
      const touch = touches[0];
      const dx = touch.x - this.data.dragStartX;
      const dy = touch.y - this.data.dragStartY;
      this.dragPoint(dx, dy, 'polygon');
      this.setData({
        dragStartX: touch.x,
        dragStartY: touch.y
      });
    } else if (touches.length === 2 && this.data.isPinching) {
      const dx = touches[0].x - touches[1].x;
      const dy = touches[0].y - touches[1].y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const delta = distance - this.data.lastTouchDistance;
      let newScale = this.data.polygonScale + delta * 0.005;
      newScale = Math.max(0.5, Math.min(3, newScale));
      this.setData({ polygonScale: newScale });
      this.redrawPolygon();
      this.setData({ lastTouchDistance: distance });
    } else if (touches.length === 1 && !this.data.isPinching && !this.data.editingPoint) {
      const dx = touches[0].x - this.data.lastTouchX;
      const dy = touches[0].y - this.data.lastTouchY;
      this.setData({
        polygonOffsetX: this.data.polygonOffsetX + dx,
        polygonOffsetY: this.data.polygonOffsetY + dy,
        lastTouchX: touches[0].x,
        lastTouchY: touches[0].y
      });
      this.redrawPolygon();
    }
  },

  onPolygonTouchEnd(e) {
    this.setData({ isPinching: false, editingPoint: null });
  },

  redrawPolygon() {
    if (!this.polyData) return;
    const { canvas, ctx, dpr, drawW, drawH, origOffsetX, origOffsetY, origScale, img } = this.polyData;
    const canvasW = this.data.polygonCanvasW;
    const canvasH = this.data.polygonCanvasH;
    const scale = this.data.polygonScale;
    const offsetX = origOffsetX + this.data.polygonOffsetX;
    const offsetY = origOffsetY + this.data.polygonOffsetY;
    const vertices = this.data.vertices;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, offsetX, offsetY, drawW * scale, drawH * scale);

    if (vertices.length === 0) return;

    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(59,130,246,0.15)';

    const first = vertices[0];
    ctx.beginPath();
    ctx.moveTo(offsetX + first.x * origScale * scale, offsetY + first.y * origScale * scale);
    for (let i = 1; i < vertices.length; i++) {
      const v = vertices[i];
      ctx.lineTo(offsetX + v.x * origScale * scale, offsetY + v.y * origScale * scale);
    }
    if (vertices.length >= 3) ctx.closePath();
    ctx.stroke();
    if (vertices.length >= 3) ctx.fill();

    vertices.forEach((v, i) => {
      const screenX = offsetX + v.x * origScale * scale;
      const screenY = offsetY + v.y * origScale * scale;
      const isEditing = this.data.editingPoint?.type === 'vertex' && this.data.editingPoint?.index === i;
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(screenX, screenY, isEditing ? 14 : 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText((i + 1).toString(), screenX, screenY);
    });

    ctx.restore();

    this.currentPolyDraw = { offsetX, offsetY, scale };
  },

  onPolygonTap(e) {
    if (this.data.editingPoint) return;
    const { x, y } = e.detail;
    const { offsetX, offsetY, scale } = this.currentPolyDraw || { offsetX: 0, offsetY: 0, scale: 1 };
    const { origOffsetX, origOffsetY, origScale } = this.polyData;

    const imgX = (x - offsetX) / (origScale * scale);
    const imgY = (y - offsetY) / (origScale * scale);
    const vertices = [...this.data.vertices, { x: imgX, y: imgY }];
    this.setData({ vertices });
    this.redrawPolygon();
    this.updatePreviewArea();
  },

  updatePreviewArea() {
    const { vertices, pxPerMm } = this.data;
    if (vertices.length < 3) return;
    const areaUtil = require('../../utils/area.js');
    const pixelArea = areaUtil.shoelaceArea(vertices);
    const areaCm2 = areaUtil.pixelToCm2(pixelArea, pxPerMm);
    this.setData({ previewArea: areaCm2 });
  },

  undoVertex() {
    const vertices = this.data.vertices.slice(0, -1);
    this.setData({ vertices });
    this.redrawPolygon();
    if (vertices.length >= 3) {
      this.updatePreviewArea();
    } else {
      this.setData({ previewArea: '' });
    }
  },

  resetPolygon() {
    this.setData({ vertices: [], previewArea: '', editingPoint: null });
    this.redrawPolygon();
  },

  confirmPolygon() {
    const { vertices, pxPerMm } = this.data;
    const areaUtil = require('../../utils/area.js');
    const pixelArea = areaUtil.shoelaceArea(vertices);
    const areaCm2 = areaUtil.pixelToCm2(pixelArea, pxPerMm);
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.setData({
      step: 4,
      resultArea: areaCm2,
      measureTime: timeStr
    });
  },

  // Step 4
  saveRecord() {
    const record = {
      id: `record_${Date.now()}`,
      createdAt: new Date().toISOString(),
      imageLocalId: this.data.imagePath,
      areaCm2: this.data.resultArea,
      vertexCount: this.data.vertices.length,
      rulerPxPerMm: this.data.pxPerMm,
      note: ''
    };
    const records = wx.getStorageSync('skin_records') || [];
    records.unshift(record);
    wx.setStorageSync('skin_records', records);
    wx.showToast({ title: '已保存', icon: 'success' });
  },

  shareResult() {
    wx.showShareMenu({ withShareTicket: true });
    wx.showToast({ title: '请点击右上角分享', icon: 'none', duration: 2000 });
  },

  reMeasure() {
    wx.redirectTo({ url: '/pages/measure/measure' });
  }
});