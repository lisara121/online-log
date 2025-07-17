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
      // "*.css", // 注意：暂时注释掉CSS屏蔽，因为它可能导致页面布局完全错乱。可以后续再测试打开。
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
 * 链接替换函数 (修正后的版本)
 * @param {string} html - HTML内容
 * @param {URL} targetUrl - 目标URL对象
 * @param {string} proxyBase - 代理基础URL
 * @returns {string} - 替换链接后的HTML
 */
function replaceLinksImproved(html, targetUrl, proxyBase) {
  const targetOrigin = targetUrl.origin;
  const targetPath = targetUrl.pathname;
  const currentDir = targetPath.substring(0, targetPath.lastIndexOf('/') + 1);

  const replacer = (regex, processor) => {
    html = html.replace(regex, (match, ...args) => {
      // 提取URL部分
      const urlPart = args.find(arg => typeof arg === 'string' && arg.includes(match.match(/(href|src|action|url\()(["']?)([^)"']+)/)[3]));
      if (!urlPart || urlPart.startsWith('data:') || urlPart.startsWith('#') || urlPart.startsWith('javascript:')) {
        return match;
      }
       // 检查是否已经是代理链接
      if (urlPart.includes('/optimized-proxy?')) {
        return match;
      }
      return processor(match, ...args);
    });
  };

  // 1. 替换绝对和协议相对URL (href="http://...", href="//...")
  replacer(/(href|src|action)=(["'])(https?:)?\/\/([^"']+)(["'])/gi, (match, attr, quote1, protocol, url, quote2) => {
    const fullUrl = `${protocol || targetUrl.protocol}//${url}`;
    return `${attr}=${quote1}${proxyBase}${encodeURIComponent(fullUrl)}${quote2}`;
  });

  // 2. 替换根相对路径 (href="/page")
  replacer(/(href|src|action)=(["'])(\/[^/][^"']*)(["'])/gi, (match, attr, quote1, path, quote2) => {
    return `${attr}=${quote1}${proxyBase}${encodeURIComponent(targetOrigin + path)}${quote2}`;
  });

  // 3. 替换相对路径 (href="page", href="./page")
  replacer(/(href|src|action)=(["'])(?!\/|#|javascript:|data:)([^"':]+)(["'])/gi, (match, attr, quote1, path, quote2) => {
    let resolvedPath = path.startsWith('./') ? path.substring(2) : path;
    const fullUrl = new URL(resolvedPath, targetUrl.href).href;
    return `${attr}=${quote1}${proxyBase}${encodeURIComponent(fullUrl)}${quote2}`;
  });

  // 4. 替换CSS中的url()
  replacer(/url\((["']?)([^)'"]+)(["']?)\)/gi, (match, quote1, url, quote2) => {
    let fullUrl;
    if (url.match(/^(https?:)?\/\//)) {
      fullUrl = new URL(url, targetUrl.protocol + '//').href;
    } else if (url.startsWith('/')) {
      fullUrl = targetOrigin + url;
    } else {
      fullUrl = new URL(url, targetUrl.href).href;
    }
    return `url(${quote1}${proxyBase}${encodeURIComponent(fullUrl)}${quote2})`;
  });

  return html;
}
