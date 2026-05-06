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
    isPinching: false
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

  // Step 2: 初始化比例尺标定画布
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

        // 显示图片
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

  // 缩放控制
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

  // 触控开始
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
      this.setData({
        lastTouchX: touches[0].x,
        lastTouchY: touches[0].y
      });
    }
  },

  // 触控移动
  onCalibrationTouchMove(e) {
    const touches = e.touches;
    if (touches.length === 2 && this.data.isPinching) {
      const dx = touches[0].x - touches[1].x;
      const dy = touches[0].y - touches[1].y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const delta = distance - this.data.lastTouchDistance;
      let newScale = this.data.calibrationScale + delta * 0.005;
      newScale = Math.max(0.5, Math.min(3, newScale));
      this.setData({ calibrationScale: newScale });
      this.redrawCalibration();
      this.setData({ lastTouchDistance: distance });
    } else if (touches.length === 1 && !this.data.isPinching) {
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

  // 触控结束
  onCalibrationTouchEnd(e) {
    this.setData({ isPinching: false });
  },

  // 重绘标定画面
  redrawCalibration() {
    const { canvas, ctx, dpr, drawW, drawH, origOffsetX, origOffsetY, origScale, img } = this.canvasData;
    const canvasW = this.data.calibrationCanvasW;
    const canvasH = this.data.calibrationCanvasH;
    const scale = this.data.calibrationScale;
    const offsetX = origOffsetX + this.data.calibrationOffsetX;
    const offsetY = origOffsetY + this.data.calibrationOffsetY;

    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.drawImage(img, offsetX, offsetY, drawW * scale, drawH * scale);

    // 绘制标记点
    const p1 = this.data.rulerPoint1;
    const p2 = this.data.rulerPoint2;
    if (p1 && p2) {
      const pointScale = (canvasW / drawW) / origScale;
      ctx.save();
      ctx.fillStyle = '#ff3b30';
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 3;

      const screenX1 = offsetX + p1.x * origScale * scale;
      const screenY1 = offsetY + p1.y * origScale * scale;
      const screenX2 = offsetX + p2.x * origScale * scale;
      const screenY2 = offsetY + p2.y * origScale * scale;

      [ { x: screenX1, y: screenY1 }, { x: screenX2, y: screenY2 } ].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.moveTo(screenX1, screenY1);
      ctx.lineTo(screenX2, screenY2);
      ctx.stroke();
      ctx.restore();
    }

    // 保存当前的显示参数
    this.currentDraw = { offsetX, offsetY, scale };
  },

  // 点击标定比例尺
  onCalibrationTap(e) {
    if (this.data.calibrationDone) return;
    const { x, y } = e.detail;
    const { offsetX, offsetY, scale } = this.currentDraw || { offsetX: 0, offsetY: 0, scale: 1 };
    const { origOffsetX, origOffsetY, origScale } = this.canvasData;

    // 转换为原始图片坐标
    const imgX = (x - offsetX) / (origScale * scale);
    const imgY = (y - offsetY) / (origScale * scale);

    if (this.data.calibrationTarget === '0mm') {
      this.setData({ calibrationTarget: '10mm', rulerPoint1: { x: imgX, y: imgY } });
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
        calibrationDone: true
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
      calibrationOffsetY: 0
    });
    this.initCalibrationCanvas();
  },

  confirmCalibration() {
    this.setData({ step: 3 });
    this.initPolygonCanvas();
  },

  // Step 3: 初始化多边形画布
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

  // 缩放控制
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

  // 触控开始
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
      this.setData({
        lastTouchX: touches[0].x,
        lastTouchY: touches[0].y
      });
    }
  },

  // 触控移动
  onPolygonTouchMove(e) {
    const touches = e.touches;
    if (touches.length === 2 && this.data.isPinching) {
      const dx = touches[0].x - touches[1].x;
      const dy = touches[0].y - touches[1].y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const delta = distance - this.data.lastTouchDistance;
      let newScale = this.data.polygonScale + delta * 0.005;
      newScale = Math.max(0.5, Math.min(3, newScale));
      this.setData({ polygonScale: newScale });
      this.redrawPolygon();
      this.setData({ lastTouchDistance: distance });
    } else if (touches.length === 1 && !this.data.isPinching) {
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

  // 触控结束
  onPolygonTouchEnd(e) {
    this.setData({ isPinching: false });
  },

  // 重绘多边形
  redrawPolygon() {
    const { ctx, dpr, drawW, drawH, origOffsetX, origOffsetY, origScale, img } = this.polyData;
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
    ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';

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

    // 绘制顶点
    ctx.fillStyle = '#3b82f6';
    vertices.forEach(v => {
      ctx.beginPath();
      ctx.arc(offsetX + v.x * origScale * scale, offsetY + v.y * origScale * scale, 6, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();

    this.currentPolyDraw = { offsetX, offsetY, scale };
  },

  // 点击画多边形顶点
  onPolygonTap(e) {
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
    this.setData({ vertices: [], previewArea: '' });
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

  // Step 4: 保存记录
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

  // Step 4: 分享结果
  shareResult() {
    wx.showShareMenu({ withShareTicket: true });
    wx.showToast({ title: '请点击右上角分享', icon: 'none', duration: 2000 });
  },

  reMeasure() {
    wx.redirectTo({ url: '/pages/measure/measure' });
  }
});