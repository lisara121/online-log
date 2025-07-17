/**
 * 针对特定网站优化的高级代理函数
 * 核心思路：
 * 1. 识别要代理的特定网站 (e.g., '123av')。
 * 2. 加载该网站的专属配置，主要是 blockList (资源屏蔽列表)。
 * 3. 在发起请求前，检查目标 URL 是否在 blockList 中。如果是，则直接拦截，不向源站发请求。
 * 4. 对于正常请求，使用 advanced-proxy 的逻辑，获取内容并替换链接。
 */

// 站点专属配置
const siteConfigs = {
  '123av': {
    // 目标网站的基础 URL
    targetUrl: 'https://123av.com/zh/',
    // 资源屏蔽列表，来自你提供的 JSON
    blockList: [
      "*.ico",
      "*.png",
      "*.jpg",
      "*.vtt",
      "*.css", // 屏蔽所有CSS，如果导致页面错乱可以移除此条
      "https://*.googleapis.com/*",
      "https://*.googletagmanager.com/*",
      "https://*.recombee.com/*",
      "https://*.google-analytics.com/*",
      "https://njav.tv/recomm/items/*"
    ]
  }
  // 未来可以在此添加更多网站的配置
};

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const siteKey = url.searchParams.get('site'); // e.g., '123av'

  if (!siteKey || !siteConfigs[siteKey]) {
    return new Response('缺少有效的 site 参数', { status: 400 });
  }

  const config = siteConfigs[siteKey];
  // 决定实际要请求的目标URL。如果是首页，直接用配置的；否则用原始请求的url参数。
  const targetUrl = url.searchParams.get('url') || config.targetUrl;

  // --- 核心优化：请求拦截 ---
  // 将 blockList 的字符串转为正则表达式，以便更灵活地匹配
  const blockPatterns = config.blockList.map(pattern => new RegExp(pattern.replace(/\*/g, '.*?')));
  for (const pattern of blockPatterns) {
    if (pattern.test(targetUrl)) {
      console.log(`[Optimized Proxy] 已拦截请求: ${targetUrl}`);
      // 返回 204 No Content，表示请求成功但无内容返回，浏览器会忽略它
      return new Response(null, { status: 204 });
    }
  }

  try {
    console.log(`[Optimized Proxy] 代理请求: ${targetUrl}`);
    
    // --- 以下代码基本复用 advanced-proxy.js 的逻辑 ---
    const headers = new Headers();
    const forwardHeaders = ['user-agent', 'accept', 'accept-language', 'referer', 'cache-control'];
    forwardHeaders.forEach(header => {
      if (request.headers.get(header)) {
        headers.set(header, request.headers.get(header));
      }
    });

    const targetRequest = new Request(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : undefined,
      redirect: 'follow',
    });

    const response = await fetch(targetRequest);

    const responseHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      if (!['content-encoding', 'content-length', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }

    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('X-Proxied-By', 'EdgeOne-Pages-Optimized-Proxy');

    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('text/html')) {
      let html = await response.text();
      
      // 注意：这里的 proxyBase 必须指向我们自己这个函数
      const proxyBase = `${url.protocol}//${url.host}/optimized-proxy?site=${siteKey}&url=`;
      
      const parsedTargetUrl = new URL(targetUrl);
      
      html = replaceLinksImproved(html, parsedTargetUrl, proxyBase);
      
      responseHeaders.set('Content-Type', 'text/html; charset=UTF-8');
      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } else {
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    }
  } catch (error) {
    console.error(`优化代理请求失败: ${error.message}`);
    return new Response(`优化代理请求失败: ${error.message}`, { status: 500 });
  }
}

/**
 * 链接替换函数 (直接从 advanced-proxy.js 复制过来即可)
 * @param {string} html - HTML内容
 * @param {URL} targetUrl - 目标URL对象
 * @param {string} proxyBase - 代理基础URL
 * @returns {string} - 替换链接后的HTML
 */
function replaceLinksImproved(html, targetUrl, proxyBase) {
  // ... 此处省略，请将 advanced-proxy.js 中的 replaceLinksImproved 函数完整地复制到这里 ...
  const targetOrigin = targetUrl.origin;
  const targetHost = targetUrl.host;
  const targetPath = targetUrl.pathname;
  const currentDir = targetPath.substring(0, targetPath.lastIndexOf('/') + 1);
  html = html.replace(/(href|src)=(["'])(https?:\/\/[^"']+)(["'])/gi, (match, attr, quote1, url, quote2) => {
    if (url.includes('/optimized-proxy?')) return match;
    return `${attr}=${quote1}${proxyBase}${encodeURIComponent(url)}${quote2}`;
  });
  html = html.replace(/(href|src)=(["'])\/\/([^"']+)(["'])/gi, (match, attr, quote1, url, quote2) => {
    const absoluteUrl = `${targetUrl.protocol}//${url}`;
    return `${attr}=${quote1}${proxyBase}${encodeURIComponent(absoluteUrl)}${quote2}`;
  });
  html = html.replace(/(href|src)=(["'])(\/[^"']*)(["'])/gi, (match, attr, quote1, path, quote2) => {
    return `${attr}=${quote1}${proxyBase}${encodeURIComponent(targetOrigin + path)}${quote2}`;
  });
  html = html.replace(/(href|src)=(["'])(?!https?:\/\/)(?!\/\/)(?!\/)(?!#)(?!javascript:)(?!data:)([^"']+)(["'])/gi, 
    (match, attr, quote1, path, quote2) => {
      if (path.startsWith('./')) { path = path.substring(2); }
      let fullUrl;
      if (path.startsWith('?')) {
        fullUrl = targetOrigin + targetPath + path;
      } else {
        fullUrl = targetOrigin + (currentDir + path).replace(/\/\.?\//g, '/').replace(/\/+/g, '/');
      }
      return `${attr}=${quote1}${proxyBase}${encodeURIComponent(fullUrl)}${quote2}`;
    }
  );
  html = html.replace(/url\((["']?)([^)'"]+)(["']?)\)/gi, (match, quote1, url, quote2) => {
    if (url.startsWith('data:') || url.startsWith('#') || url.includes('/optimized-proxy?')) { return match; }
    let fullUrl;
    if (url.match(/^https?:\/\//i)) { fullUrl = url; }
    else if (url.startsWith('//')) { fullUrl = `${targetUrl.protocol}${url}`; }
    else if (url.startsWith('/')) { fullUrl = targetOrigin + url; }
    else {
      if (url.startsWith('./')) { url = url.substring(2); }
      fullUrl = targetOrigin + (currentDir + url).replace(/\/\.?\//g, '/').replace(/\/+/g, '/');
    }
    return `url(${quote1}${proxyBase}${encodeURIComponent(fullUrl)}${quote2})`;
  });
  html = html.replace(/action=(["'])(https?:\/\/[^"']+|\/[^"']+|[^"':]+)(["'])/gi, (match, quote1, url, quote2) => {
    if (url.includes('/optimized-proxy?')) return match;
    let fullUrl;
    if (url.match(/^https?:\/\//i)) { fullUrl = url; }
    else if (url.startsWith('/')) { fullUrl = targetOrigin + url; }
    else {
      if (url.startsWith('./')) { url = url.substring(2); }
      fullUrl = targetOrigin + (currentDir + url).replace(/\/\.?\//g, '/').replace(/\/+/g, '/');
    }
    return `action=${quote1}${proxyBase}${encodeURIComponent(fullUrl)}${quote2}`;
  });
  return html;
}
