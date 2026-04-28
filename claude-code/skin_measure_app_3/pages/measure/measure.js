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
    savedRecordId: ''
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
        const canvasW = screenWidth - 64;
        const canvasH = canvasW * 0.75;
        canvas.width = canvasW * dpr;
        canvas.height = canvasH * dpr;
        ctx.scale(dpr, dpr);

        // 显示图片
        const img = canvas.createImage();
        img.src = this.data.imagePath;
        img.onload = () => {
          const scale = Math.min(canvasW / img.width, canvasH / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const offsetX = (canvasW - drawW) / 2;
          const offsetY = (canvasH - drawH) / 2;
          this.canvasData = { canvas, ctx, dpr, drawW, drawH, offsetX, offsetY, scale };
          ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
        };
        img.onerror = () => {
          wx.showToast({ title: '图片加载失败', icon: 'none' });
        };
      });
  },

  // Step 2: 点击标定比例尺
  onCalibrationTap(e) {
    if (this.data.calibrationDone) return;
    const { x, y } = e.detail;
    const { ctx, drawW, drawH, offsetX, offsetY } = this.canvasData;
    const canvasW = ctx.canvas.width / this.canvasData.dpr;

    const tapX = x;
    const tapY = y;

    if (this.data.calibrationTarget === '0mm') {
      this.setData({ calibrationTarget: '10mm', rulerPoint1: { x: tapX, y: tapY } });
    } else {
      const point2 = { x: tapX, y: tapY };
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
      this.redrawCalibration(p1, point2);
    }
  },

  // 重绘标定画面 + 标记点
  redrawCalibration(p1, p2) {
    const { canvas, ctx, dpr, drawW, drawH, offsetX, offsetY, scale } = this.canvasData;
    const canvasW = ctx.canvas.width / dpr;
    const canvasH = ctx.canvas.height / dpr;

    ctx.clearRect(0, 0, canvasW, canvasH);
    const img = canvas.createImage();
    img.src = this.data.imagePath;
    img.onload = () => {
      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
      ctx.save();
      ctx.fillStyle = '#ff3b30';
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 3;
      [p1, p2].forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    };
  },

  resetCalibration() {
    this.setData({
      calibrationTarget: '0mm',
      rulerPoint1: null,
      rulerPoint2: null,
      pxPerMm: 0,
      mmPerPxStr: '',
      calibrationDone: false,
      step: 2
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
        const canvasW = screenWidth - 64;
        const canvasH = canvasW * 0.75;
        canvas.width = canvasW * dpr;
        canvas.height = canvasH * dpr;
        ctx.scale(dpr, dpr);

        const img = canvas.createImage();
        img.src = this.data.imagePath;
        img.onload = () => {
          const scale = Math.min(canvasW / img.width, canvasH / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const offsetX = (canvasW - drawW) / 2;
          const offsetY = (canvasH - drawH) / 2;
          this.polyData = { canvas, ctx, dpr, drawW, drawH, offsetX, offsetY, scale };
          this.redrawPolygon();
        };
        img.onerror = () => {
          wx.showToast({ title: '图片加载失败', icon: 'none' });
        };
      });
  },

  // Step 3: 点击画多边形顶点
  onPolygonTap(e) {
    const { x, y } = e.detail;
    const { offsetX, offsetY, scale } = this.polyData;
    const imgX = (x - offsetX) / scale;
    const imgY = (y - offsetY) / scale;
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

  redrawPolygon() {
    const { ctx, drawW, drawH, offsetX, offsetY, scale } = this.polyData;
    const canvasW = ctx.canvas.width / this.polyData.dpr;
    const canvasH = ctx.canvas.height / this.polyData.dpr;
    const { vertices } = this.data;

    ctx.clearRect(0, 0, canvasW, canvasH);
    const img = ctx.canvas.ownerDocument?.createElement?.('img') || {};
    // wx canvas does not support createImage this way, use canvas.createImage
    const imgObj = this.polyData.canvas.createImage();
    imgObj.src = this.data.imagePath;
    imgObj.onload = () => {
      ctx.drawImage(imgObj, offsetX, offsetY, drawW, drawH);
      if (vertices.length === 0) return;

      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 3;
      ctx.fillStyle = 'rgba(59, 130, 246, 0.15)';

      ctx.beginPath();
      const first = vertices[0];
      ctx.moveTo(offsetX + first.x * scale, offsetY + first.y * scale);
      for (let i = 1; i < vertices.length; i++) {
        const v = vertices[i];
        ctx.lineTo(offsetX + v.x * scale, offsetY + v.y * scale);
      }
      if (vertices.length >= 3) ctx.closePath();
      ctx.stroke();
      if (vertices.length >= 3) ctx.fill();

      // Draw vertex points
      ctx.fillStyle = '#3b82f6';
      vertices.forEach(v => {
        ctx.beginPath();
        ctx.arc(offsetX + v.x * scale, offsetY + v.y * scale, 6, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    };
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