# public/vendor —— 本地化的前端静态资源

本目录存放 Leaflet（1.9.4）的本地副本，使页面不依赖 unpkg CDN（国内访问更快、更稳定）。

- 当前环境无外网，未下载成功；页面会自动回退到 unpkg CDN 加载，功能不受影响。
- 部署到有外网的服务器后，执行一次：
      npm run fetch-vendor
  即可把 leaflet.js / leaflet.css 下载到本目录，此后完全脱离 CDN。