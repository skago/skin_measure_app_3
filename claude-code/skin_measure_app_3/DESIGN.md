# 皮肤病变面积测量小程序 - 设计规范

## 设计系统

### 颜色

| 用途 | 颜色 | Hex |
|------|------|-----|
| 主色 | 蓝色 | `#3b82f6` |
| 背景 | 浅灰 | `#f8f8f8` |
| 卡片 | 白色 | `#ffffff` |
| 标题 | 深灰 | `#1a1a1a` |
| 正文 | 中灰 | `#333333` |
| 注释 | 浅灰 | `#666666` |
| 禁用 | 淡灰 | `#999999` |
| 边框 | 灰色 | `#dddddd` |

### 字号

| 用途 | 大小 |
|------|------|
| 大标题 | 40rpx |
| 页面标题 | 32-36rpx |
| 按钮 | 28-32rpx |
| 正文 | 26-28rpx |
| 注释 | 22-24rpx |

### 间距

基础单位: `8rpx`

- 小: `16rpx`
- 中: `24rpx` / `32rpx`
- 大: `48rpx` / `60rpx`

### 圆角

| 用途 | 圆角 |
|------|------|
| 按钮 | `12rpx` |
| 卡片 | `12-16rpx` |
| 输入框 | `8rpx` |

### 触摸区域

- 最小: `80rpx` (≈ 27px)
- 推荐: `88rpx` (≈ 44px)

---

## 组件

### 按钮

```css
.btn-primary {
  background: #3b82f6;
  color: #fff;
  border-radius: 12rpx;
  font-size: 32rpx;
  padding: 28rpx;
}

.btn-secondary {
  background: #fff;
  color: #3b82f6;
  border: 2rpx solid #3b82f6;
  border-radius: 12rpx;
  font-size: 32rpx;
  padding: 28rpx;
}
```

### 卡片

```css
.card {
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
}
```

---

## 页面

### 通用结构

```css
.page {
  min-height: 100vh;
  background: #f8f8f8;
  padding: 32rpx;
}
```