Page({
  data: {
    records: []
  },

  onShow() {
    this.loadRecords();
  },

  loadRecords() {
    const records = wx.getStorageSync('skin_records') || [];
    const formatted = records.map(r => ({
      ...r,
      createdAtStr: new Date(r.createdAt).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    }));
    this.setData({ records: formatted });
  },

  viewDetail(e) {
    const { id } = e.currentTarget.dataset;
    const record = this.data.records.find(r => r.id === id);
    if (!record) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '操作',
      content: '选择操作',
      cancelText: '删除记录',
      confirmText: '查看详情',
      success: (res) => {
        if (res.cancel) {
          this.deleteRecord(id);
        } else {
          wx.showModal({
            title: '测量详情',
            content: `面积：${record.areaCm2} cm²\n顶点数：${record.vertexCount}\n测量时间：${record.createdAtStr}`,
            showCancel: false
          });
        }
      }
    });
  },

  deleteRecord(id) {
    wx.showModal({
      title: '确认删除',
      content: '确定删除该条记录？',
      success: (res) => {
        if (res.confirm) {
          const records = wx.getStorageSync('skin_records') || [];
          const filtered = records.filter(r => r.id !== id);
          wx.setStorageSync('skin_records', filtered);
          this.loadRecords();
          wx.showToast({ title: '已删除', icon: 'success' });
        }
      }
    });
  },

  goMeasure() {
    wx.navigateTo({ url: '/pages/measure/measure' });
  }
});