/**
 * 针对特定网站优化的高级代理函数 (修正版)
 */

// 站点专属配置
const siteConfigs = {
  '123av': {
    targetUrl: 'https://123av.com/zh/',
    blockList: [
      "*.ico", "*.png", "*.jpg", "*.vtt",
      // "*.css", // 建议保持注释，否则页面会无样式
      "https://*.googleapis.com/*",
      "https://*.googletagmanager.com/*",
      "https://*.recombee.com/*",
      "https://*.google-analytics.com/*",
      "https://njav.tv/recomm/items/*"
    ]
  }
};

export async function onRequest({ request }) {
  const url = new URL(request.url);
  const siteKey = url.searchParams.get('site');

  if (!siteKey || !siteConfigs[siteKey]) {
    return new Response('缺少有效的 site 参数', { status: 400 });
  }

  const config = siteConfigs[siteKey];
  const targetUrl = url.searchParams.get('url') || config.targetUrl;

  // --- 核心优化：请求拦截 ---
  const blockPatterns = config.blockList.map(pattern => new RegExp(pattern.replace(/\*/g, '.*?')));
  for (const pattern of blockPatterns) {
    if (pattern.test(targetUrl)) {
      console.log(`[Optimized Proxy] 已拦截请求: ${targetUrl}`);
      return new Response(null, { status: 204 });
    }
  }

  try {
    console.log(`[Optimized Proxy] 代理请求: ${targetUrl}`);
    
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
    const responseHeaders = new Headers(response.headers);
    
    // 清理可能引起冲突的头
    responseHeaders.delete('content-encoding');
    responseHeaders.delete('content-length');
    responseHeaders.delete('connection');
    responseHeaders.delete('transfer-encoding');

    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('X-Proxied-By', 'EdgeOne-Pages-Optimized-Proxy');

    const contentType = responseHeaders.get('content-type') || '';
    
    if (contentType.includes('text/html')) {
      let html = await response.text();
      const proxyBase = `${url.protocol}//${url.host}/optimized-proxy?site=${siteKey}&url=`;
      const parsedTargetUrl = new URL(targetUrl);
      
      html = replaceLinksImproved(html, parsedTargetUrl, proxyBase);
      
      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } else {
      return new Response(response.body, {
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
 * 链接替换函数 (已修正，逻辑与 advanced-proxy.js 保持一致)
 * @param {string} html - HTML内容
 * @param {URL} targetUrl - 目标URL对象
 * @param {string} proxyBase - 代理基础URL
 * @returns {string} - 替换链接后的HTML
 */
function replaceLinksImproved(html, targetUrl, proxyBase) {
  const targetOrigin = targetUrl.origin;
  const targetPath = targetUrl.pathname;
  const currentDir = targetPath.substring(0, targetPath.lastIndexOf('/') + 1);
  
  // 替换所有链接的核心逻辑
  const replaceFunc = (match, attr, quote1, url, quote2) => {
    // 关键点：检查URL是否已经是我们自己的代理链接，如果是，则跳过，避免重复替换
    if (url.includes('/optimized-proxy?site=')) {
      return match;
    }
    
    let fullUrl;
    if (url.startsWith('http')) {
      fullUrl = url;
    } else if (url.startsWith('//')) {
      fullUrl = `${targetUrl.protocol}${url}`;
    } else if (url.startsWith('/')) {
      fullUrl = `${targetOrigin}${url}`;
    } else if (url.startsWith('?')) {
        fullUrl = targetOrigin + targetPath + url;
    } else if (url.startsWith('#') || url.startsWith('javascript:') || url.startsWith('data:')) {
      return match; // 不处理这些类型的链接
    } else {
      fullUrl = `${targetOrigin}${currentDir}${url}`.replace(/\/\.?\//g, '/');
    }
    
    return `${attr}=${quote1}${proxyBase}${encodeURIComponent(fullUrl)}${quote2}`;
  };

  // 1. 替换 href, src, action 属性
  html = html.replace(/(href|src|action)=(["'])([^"']+)(["'])/gi, replaceFunc);

  // 2. 替换 CSS 中的 url()
  html = html.replace(/url\((["']?)([^)'"]+)(["']?)\)/gi, (match, quote1, url, quote2) => {
    if (url.includes('/optimized-proxy?site=') || url.startsWith('data:')) {
      return match;
    }
    let fullUrl;
    if (url.startsWith('http')) {
      fullUrl = url;
    } else if (url.startsWith('//')) {
      fullUrl = `${targetUrl.protocol}${url}`;
    } else if (url.startsWith('/')) {
      fullUrl = `${targetOrigin}${url}`;
    } else {
      fullUrl = `${targetOrigin}${currentDir}${url}`.replace(/\/\.?\//g, '/');
    }
    return `url(${quote1}${proxyBase}${encodeURIComponent(fullUrl)}${quote2})`;
  });

  return html;
}
