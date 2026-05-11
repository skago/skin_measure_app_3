# 皮肤面积测量小程序

微信小程序，用于临床皮肤病变面积测量。

## 快速开始

### 1. 打开项目
```
在微信开发者工具中打开项目目录
```

### 2. 配置 AppID（如需）
修改 `project.config.json` 中的 `appid`

### 3. 开发运行
点击"编译"即可在微信开发者工具中预览

## 项目结构

```
├── pages/
│   ├── index/        # 首页
│   ├── measure/     # 测量功能
│   └── history/    # 历史记录
├── utils/
│   ├── area.js     # 核心算法
│   └── area.test.js # 测试
└── DESIGN.md      # 设计规范
```

## 核心功能

- 上传带比例尺的图片
- 标定比例尺（0mm → 10mm）
- 描画病变区域多边形
- 自动计算面积（cm²）
- 本地记录历史

## 开发

```bash
# 运行测试
node utils/area.test.js

# 代码检查
npm run lint  # 如配置
```

## 技术栈

- 微信小程序
- 比例尺内参换算 + Shoelace 公式面积计算
- 本地存储（wx.setStorageSync）

## 隐私

所有数据保存在本地设备，不上传至任何服务器。

## API 参考

### utils/area.js

```javascript
const { shoelaceArea, pixelToCm2, calibrateRuler } = require('./utils/area.js');

// 计算多边形面积（像素）
const area = shoelaceArea([{x:0,y:0}, {x:4,y:0}, {x:0,y:3}]);
// → 6

// 像素面积转换为 cm²
const cm2 = pixelToCm2(10000, 1);
// → 100

// 比例尺校准
const pxPerMm = calibrateRuler(100);
// → 10
```