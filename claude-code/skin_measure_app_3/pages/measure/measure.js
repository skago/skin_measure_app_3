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
    detectionStep: ''
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

  // 快速自动检测比例尺 - 简化算法
  autoDetectRuler() {
    if (this.data.isDetecting) return;

    this.setData({ isDetecting: true, detectionStep: '分析中...' });

    setTimeout(() => {
      try {
        const { ctx, drawW, drawH, origOffsetX, origOffsetY, origScale } = this.canvasData;
        const canvasW = this.data.calibrationCanvasW;
        const canvasH = this.data.calibrationCanvasH;

        // 直接在当前画布上采样
        const sampleW = 100;
        const sampleH = 40;
        const imageData = ctx.getImageData(
          Math.floor(origOffsetX),
          Math.floor(canvasH * 0.3),
          sampleW,
          sampleH
        );
        const data = imageData.data;

        // 灰度转换
        const gray = new Uint8Array(sampleW);
        for (let x = 0; x < sampleW; x++) {
          const idx = x * 4;
          gray[x] = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) | 0;
        }

        // 找边缘最密集的行
        let maxEdge = 0;
        let bestRow = -1;
        for (let y = 0; y < sampleH; y++) {
          let edgeCount = 0;
          for (let x = 1; x < sampleW - 1; x++) {
            const idx = y * sampleW + x;
            if (Math.abs(gray[x] - gray[x - 1]) > 25) edgeCount++;
          }
          if (edgeCount > maxEdge) {
            maxEdge = edgeCount;
            bestRow = y;
          }
        }

        if (bestRow < 0 || maxEdge < 15) {
          wx.showToast({ title: '未检测到比例尺，请手动', icon: 'none' });
          this.setData({ isDetecting: false, detectionStep: '' });
          return;
        }

        // 在找到的行附近找刻度线
        const rowData = gray;
        let transitions = [];
        for (let x = 1; x < sampleW - 1; x++) {
          if (Math.abs(rowData[x] - rowData[x - 1]) > 30) {
            transitions.push(x);
          }
        }

        let firstX = sampleW * 0.25;
        let lastX = sampleW * 0.35;

        if (transitions.length >= 2) {
          firstX = transitions[0];
          lastX = transitions[transitions.length - 1];
        }

        // 转换为原始坐标
        const canvasY = canvasH * 0.3 + bestRow;
        const p0 = { x: (firstX - origOffsetX) / origScale, y: (canvasY - origOffsetY) / origScale };
        const p10 = { x: (lastX - origOffsetX) / origScale, y: (canvasY - origOffsetY) / origScale };
        const pxPerMm = (p10.x - p0.x) / 10;

        if (pxPerMm > 0 && pxPerMm < 50) { // 合理范围
          this.setData({
            rulerPoint1: p0,
            rulerPoint2: p10,
            pxPerMm,
            mmPerPxStr: (1 / pxPerMm).toFixed(4),
            calibrationDone: true,
            isDetecting: false,
            detectionStep: ''
          });
          this.redrawCalibration();
          wx.showToast({ title: '识别成功', icon: 'success' });
        } else {
          wx.showToast({ title: '请手动标定', icon: 'none' });
          this.setData({ isDetecting: false, detectionStep: '' });
        }
      } catch (e) {
        console.error('Error:', e);
        wx.showToast({ title: '识别出错，请手动', icon: 'none' });
        this.setData({ isDetecting: false, detectionStep: '' });
      }
    }, 50);
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
    const { origScale } = type === 'calibration' ? this.canvasData : this.polyData;

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
        this.setData({ rulerPoint1: newPoint, editingPoint: { ...newPoint, type: 'ruler1' } });
        this.redrawCalibration();
      } else if (editing.type === 'ruler2') {
        const newPoint = { x: editing.x + imgDx, y: editing.y + imgDy };
        this.setData({ rulerPoint2: newPoint, editingPoint: { ...newPoint, type: 'ruler2' } });
        this.recalcCalibration();
      }
    } else {
      if (editing.type === 'vertex') {
        const newVertices = [...this.data.vertices];
        newVertices[editing.index] = { x: editing.x + imgDx, y: editing.y + imgDy };
        this.setData({ vertices: newVertices, editingPoint: { ...newVertices[editing.index], type: 'vertex', index: editing.index } });
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
    this.setData({ pxPerMm, mmPerPxStr: mmPerPx });
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
    const { origScale } = this.canvasData;

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

  // 快速自动检测病变轮廓
  autoDetectContour() {
    if (this.data.isDetecting) return;

    this.setData({ isDetecting: true, detectionStep: '检测中...' });

    setTimeout(() => {
      try {
        const { ctx, drawW, drawH, origOffsetX, origOffsetY, origScale } = this.polyData;
        const canvasW = this.data.polygonCanvasW;
        const canvasH = this.data.polygonCanvasH;

        // 直接采样中心区域
        const sampleW = 80;
        const sampleH = 80;
        const startX = Math.floor((canvasW - sampleW) / 2);
        const startY = Math.floor((canvasH - sampleH) / 2);

        const imageData = ctx.getImageData(startX, startY, sampleW, sampleH);
        const data = imageData.data;
        const gray = new Uint8Array(sampleW * sampleH);

        for (let i = 0; i < sampleW * sampleH; i++) {
          const idx = i * 4;
          gray[i] = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) | 0;
        }

        // 中心向外搜索
        const centerX = sampleW / 2;
        const centerY = sampleH / 2;
        const contourPoints = [];
        const angles = 12;

        for (let i = 0; i < angles; i++) {
          const angle = (i / angles) * Math.PI * 2;
          const dx = Math.cos(angle);
          const dy = Math.sin(angle);

          for (let dist = 5; dist < Math.min(sampleW, sampleH) / 2 - 5; dist += 3) {
            const x = Math.floor(centerX + dx * dist);
            const y = Math.floor(centerY + dy * dist);

            if (x < 2 || x >= sampleW - 2 || y < 2 || y >= sampleH - 2) continue;

            const idx = y * sampleW + x;
            const leftIdx = y * sampleW + (x - 2);
            const rightIdx = y * sampleW + (x + 2);

            const diff = Math.abs(gray[idx] - gray[leftIdx]) + Math.abs(gray[idx] - gray[rightIdx]);
            if (diff > 40) {
              contourPoints.push({
                x: ((startX + x) - origOffsetX) / origScale,
                y: ((startY + y) - origOffsetY) / origScale
              });
              break;
            }
          }
        }

        if (contourPoints.length >= 3) {
          this.setData({
            vertices: contourPoints,
            isDetecting: false,
            detectionStep: ''
          });
          this.redrawPolygon();
          this.updatePreviewArea();
          wx.showToast({ title: '识别成功', icon: 'success' });
        } else {
          wx.showToast({ title: '请手动绘制', icon: 'none' });
          this.setData({ isDetecting: false, detectionStep: '' });
        }
      } catch (e) {
        console.error('Error:', e);
        wx.showToast({ title: '识别出错', icon: 'none' });
        this.setData({ isDetecting: false, detectionStep: '' });
      }
    }, 50);
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
    const { origScale } = this.polyData;

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