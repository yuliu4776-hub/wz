# ROBO::TRACK 机器人资产管理系统

基于 Supabase 的单页 HTML 机器人资产管理系统，支持扫码识别、盘点、标签打印、借出管理等功能。专为手机端优化，可安装为 PWA 应用。

---

## 功能概览

| 模块 | 功能 |
|------|------|
| **总览** | 机器人列表、搜索筛选、排序、批量操作、导出 |
| **扫码** | 摄像头识别二维码/条形码、连续扫码模式、快速改状态/位置 |
| **标签** | 批量生成二维码标签、打印 |
| **盘点** | 按位置分组盘点、多人实时共享盘点状态 |
| **详情** | 编辑机器人信息、借出管理、变更历史、备注 |
| **设置** | Supabase 连接配置、字段选项管理、数据导入导出 |

### 核心特性

- **扫码即查** — 扫描机器人上的二维码或条形码，直接查看信息、改状态、改位置
- **连续盘点** — 扫一个改一个，不用反复跳转页面
- **借出管理** — 记录借用人、预计归还日期，自动标记逾期
- **变更日志** — 自动记录谁在什么时间改了什么字段
- **多人协作** — 基于 Supabase 云端数据库，多人同时操作
- **PWA 支持** — 可安装到手机桌面，像原生 App 一样使用
- **XSS 防护** — 所有用户输入均经过转义处理

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | 单文件 HTML + CSS + JavaScript（无框架） |
| 数据库 | Supabase (PostgreSQL) |
| CDN 依赖 | Supabase JS SDK、qrcode.js、jsQR、SheetJS |
| 部署 | GitHub Pages（静态托管，HTTPS） |
| PWA | Service Worker + manifest.json |

---

## 快速开始

### 1. 创建 Supabase 项目

1. 注册 [supabase.com](https://supabase.com)
2. 创建新项目
3. 进入 **SQL Editor**，执行 `supabase_setup.sql` 中的建表脚本
4. 进入 **Settings > API**，复制 `Project URL` 和 `anon public` key

### 2. 配置应用

打开 `robots.html`，在设置页填入：
- Supabase Project URL
- Supabase Anon Key
- 你的姓名（用于操作记录）

也可以直接修改代码中的默认值：

```javascript
const SUPABASE_URL = 'https://xxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...';
```

### 3. 导入数据（可选）

如果有现成的 Excel 数据，在设置页使用"从 xlsx 导入"功能。Excel 格式要求：

| 列 | 字段 |
|----|------|
| A | 机器人类型 |
| B | 出厂编号 |
| C | 状态 |
| D | 责任人 |
| E | IP 地址 |
| F | 位置 |
| G | 备注 |
| H | 是否借出（OK/TRUE/是） |

### 4. 生成标签

进入"标签"页，选择需要的机器人，生成二维码标签并打印，贴到对应机器人上。

### 5. 部署到 GitHub Pages

```bash
git init
git add .
git commit -m "init"
git remote add origin https://github.com/你的用户名/仓库名.git
git push -u origin main
```

在 GitHub 仓库 Settings > Pages 中开启 `main` 分支部署，即可通过 `https://用户名.github.io/仓库名/robots.html` 访问。

---

## 项目结构

```
zichan/
├── robots.html          # 应用页面骨架
├── assets/
│   ├── css/
│   │   └── app.css      # 全局样式
│   ├── js/
│   │   └── app/         # 按职责拆分的业务脚本
│   ├── observability.js # 运行时日志、错误捕获、事件缓冲
│   ├── vendor-loader.js # CDN 依赖加载和降级
│   └── sw-register.js   # Service Worker 注册
├── supabase_setup.sql   # 数据库建表脚本
├── manifest.json        # PWA 配置
├── sw.js                # Service Worker（离线缓存）
├── icon-192.png         # PWA 图标（192x192）
├── icon-512.png         # PWA 图标（512x512）
└── README.md
```

### 前端模块划分

```
assets/js/app/
├── state.js         # 全局状态、字段选项
├── bootstrap.js     # 用户名弹窗、初始化、缓存启动
├── data.js          # Supabase 数据读写、变更日志
├── router.js        # 视图切换和渲染错误兜底
├── views-list.js    # 总览、筛选、排序、批量操作
├── views-detail.js  # 详情、编辑、图片上传
├── scanner.js       # 二维码/条形码扫码
├── labels.js        # 标签生成和打印
├── inventory.js     # 盘点流程
├── views-add.js     # 新增机器人
├── views-config.js  # 设置、导入导出、字段配置
├── utils.js         # 通用工具、Toast、Modal、日期格式化
└── index.js         # 依赖就绪后启动应用
```

### 运行时观测

应用会在浏览器控制台输出带 `[ROBO::TRACK]` 前缀的运行日志，包括：
- CDN 依赖加载成功/失败
- 应用启动和 Supabase 初始化
- 视图切换和渲染耗时
- 数据加载、保存、删除结果和耗时
- 扫码摄像头启动、条形码 API 支持情况、扫码匹配结果
- 未捕获 JS 错误和 Promise 异常

在浏览器控制台执行 `AppObs.recent()` 可以查看最近 200 条事件。

### 数据库表结构

```
robots                  # 机器人主表
├── id (UUID)           # 主键
├── type                # 类型
├── serial              # 出厂编号（type + serial 唯一）
├── status              # 状态：测试中/借出中/返修中/已出库
├── person              # 责任人
├── ip                  # IP 地址
├── location            # 当前位置
├── notes               # 备注（带时间戳的历史记录）
├── borrowed            # 是否借出
├── borrowed_to         # 借用人
├── borrowed_at         # 借出时间
├── return_due          # 预计归还日期
├── image               # 照片（URL 或 base64）
├── updater             # 最后编辑人
├── created_at          # 创建时间
└── updated_at          # 更新时间（自动触发器）

change_log              # 变更记录表
├── id (UUID)
├── robot_id            # 关联机器人
├── field               # 变更字段
├── old_value           # 旧值
├── new_value           # 新值
├── changed_by          # 操作人
└── changed_at          # 变更时间

inventory_checks        # 盘点记录表
├── id (UUID)
├── robot_id            # 关联机器人
├── status              # confirmed / missing
├── checked_by          # 盘点人
├── checked_at          # 盘点时间
└── session_id          # 盘点会话 ID
```

---

## 使用指南

### 扫码操作

1. 点击底部"扫码"按钮或右下角 FAB 按钮
2. 将摄像头对准机器人上的二维码或条形码
3. 扫到后显示信息卡片，可直接：
   - 修改位置并保存
   - 切换状态并应用
   - 查看详情
   - 继续扫描下一个

### 盘点流程

1. 进入"盘点"页，按位置分组显示所有机器人
2. 点击"在位"或"未找到"按钮
3. 多人同时盘点时数据实时共享
4. 盘点完成后可导出 Excel 结果
5. 点击"重置盘点"清空当前盘点状态

### 借出管理

1. 在详情页将状态改为"借出中"
2. 填写借用人和预计归还日期
3. 保存后，列表页会显示借出状态
4. 超过归还日期的会自动标记红色"逾期"

### 批量操作

1. 在总览页勾选多个机器人
2. 顶部出现批量操作栏
3. 可批量修改状态或批量删除

---

## 自定义配置

### 字段选项

在设置页可以自定义：
- **状态选项** — 默认：测试中、借出中、返修中、已出库
- **类型选项** — 默认：小hi、pi、Pi plus V2.0.0 等
- **责任人选项** — 从已有数据自动提取

### 图片存储

默认使用 Supabase Storage，需要：
1. 在 Supabase 控制台创建名为 `images` 的 Storage Bucket
2. 开启公开访问权限

如果未配置 Storage，图片会以 base64 格式直接存入数据库（不推荐大量使用）。

---

## 浏览器兼容

| 浏览器 | 支持 |
|--------|------|
| Chrome（手机/桌面） | ✅ 完整支持 |
| Safari（iOS） | ✅ 完整支持 |
| Firefox | ✅ 完整支持 |
| 微信内置浏览器 | ✅ 基础支持（扫码需 HTTPS） |

> 扫码功能需要 HTTPS 环境。本地开发可用 `localhost`，手机访问需部署到 HTTPS 地址。

---

## License

内部项目，仅供参考。
