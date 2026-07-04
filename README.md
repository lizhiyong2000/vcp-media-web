# vcp-media-web

vcp-media-server 的 Web 管理前端，基于 Vue 3 + Vite + Element Plus。

## 工程关系

```
github/
├── vcp-media-server/   # Rust 媒体核心
├── vcp-media-manager/  # Web 管理后端（BFF）
└── vcp-media-web/      # 本工程：Web 管理前端
```

## 功能

- **概览**：健康检查、设备/流数量、多节点状态
- **Media Server**：节点列表、详情（在线流、绑定设备、指标）
- **设备**：增删改查、推流在线状态、详情页多协议预览（HLS / HTTP-FLV / WebRTC）
- **实时预览**：支持 H.264 和 H.265 编码的 FLV 流播放（使用 mpegts.js）

## 快速开始

先启动 Rust 媒体服务与管理后端：

```bash
# 终端 1：媒体核心
cd ../vcp-media-server
cargo run --bin vcp-media-server

# 终端 2：管理 BFF
cd ../vcp-media-manager
cp .env.example .env
cp servers.json.example servers.json
cargo run
```

再启动前端：

```bash
cd vcp-media-web
npm install          # 请勿中断，否则 element-plus / hls.js 可能安装不完整
npm run dev
```

若 `npm run dev` 报 `Failed to resolve entry for package "element-plus"`，请清理后重装：

```bash
rm -rf node_modules package-lock.json
npm install
```

Node 26 若提示 esbuild 脚本未批准，可执行：

```bash
npm approve-scripts esbuild
```

浏览器访问 `http://127.0.0.1:5173`。开发模式下 Vite 将 `/api` 代理到 `http://127.0.0.1:8090`（vcp-media-manager）。

## 构建

```bash
npm run build
npm run preview
```

生产环境建议由 Nginx 托管 `dist/`，并将 `/api` 反向代理到 `vcp-media-manager`。

## 环境

| 场景 | 配置 |
|------|------|
| 本地开发 | 使用 `vite.config.ts` 内置 proxy |
| 生产部署 | 设置 Nginx `location /api` → manager:8090 |

## 项目结构

```
src/
  api/          # axios 封装
  components/   # 通用组件
  router/       # 路由
  views/        # 页面
```
