# EdgeOne Pages 网站代理应用

一个使用腾讯云EdgeOne Pages Functions构建的网站代理应用，允许用户通过EdgeOne边缘节点代理访问任意网站。

## 功能特性

- **标准代理模式**：基本的网站代理功能，转发用户请求到目标网站
- **高级代理模式**：在代理过程中自动替换HTML内容中的链接，实现无缝浏览体验
- **边缘加速**：利用EdgeOne 3200+全球边缘节点，低延迟访问目标网站
- **简洁界面**：提供友好的用户界面，简单易用

## 技术架构

- 前端：纯HTML/CSS/JavaScript，无需额外框架
- 后端：EdgeOne Pages Functions (基于V8 JavaScript引擎的Serverless环境)
- 部署：自动构建和部署到EdgeOne Pages平台

## 本地开发

1. 安装EdgeOne CLI：
```bash
npm install -g edgeone
```

2. 初始化Functions目录：
```bash
edgeone pages init
```

3. 关联项目：
```bash
edgeone pages link
```

4. 本地开发调试：
```bash
edgeone pages dev
```

5. 项目发布：将代码推送到远端仓库，自动构建发布

## 项目结构

```
page-py/
├── functions/
│   ├── proxy.js          # 标准代理函数
│   └── advanced-proxy.js # 高级代理函数（支持链接替换）
├── public/
│   ├── index.html        # 主页面
│   └── advanced.html     # 高级代理页面
└── README.md             # 项目说明文档
```

## 使用方法

1. 访问项目首页
2. 在输入框中输入要代理的网站URL (必须包含http://或https://)
3. 选择代理模式：
   - **标准代理**：适合简单的资源获取
   - **高级代理**：适合需要在网站内点击链接浏览的情况
4. 点击生成的链接即可通过代理访问目标网站

## 注意事项

- 本项目仅供学习和研究使用
- 请勿用于访问违反法律法规的内容
- 不支持WebSocket等特殊协议
- 某些高度动态化的网站可能无法完全正常工作

## 参考资源

- [EdgeOne Pages Functions 文档](https://www.tencentcloud.com/document/product/1552)
- [EdgeOne Pages GitHub 模板仓库](https://github.com/TencentEdgeOne/pages-templates) 