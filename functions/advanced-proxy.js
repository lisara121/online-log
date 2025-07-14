export async function onRequest({ request }) {
  try {
    // 从请求URL中获取目标URL
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    // 检查是否提供了URL
    if (!targetUrl) {
      return new Response('缺少目标URL参数', {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=UTF-8' }
      });
    }

    // 解析目标URL以备后续处理
    const parsedTargetUrl = new URL(targetUrl);
    const targetOrigin = parsedTargetUrl.origin;
    const targetPath = parsedTargetUrl.pathname;

    // 记录请求信息
    console.log(`高级代理请求: ${targetUrl}`);

    // 构建请求头 - 转发部分原始请求头
    const headers = new Headers();
    const forwardHeaders = [
      'user-agent',
      'accept',
      'accept-language',
      'accept-encoding',
      'content-type'
    ];
    
    forwardHeaders.forEach(header => {
      if (request.headers.get(header)) {
        headers.set(header, request.headers.get(header));
      }
    });

    // 请求目标网站
    const targetRequest = new Request(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : undefined,
      redirect: 'follow',
    });

    // 发送请求并获取响应
    const response = await fetch(targetRequest);

    // 构建响应头
    const responseHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      // 忽略某些响应头以避免冲突
      if (!['content-encoding', 'content-length', 'connection'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }

    // 添加CORS头
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    // 添加代理标识
    responseHeaders.set('X-Proxied-By', 'EdgeOne-Pages-Advanced-Proxy');

    // 获取响应内容类型
    const contentType = response.headers.get('content-type') || '';
    
    // 如果是HTML内容，处理内部链接
    if (contentType.includes('text/html')) {
      let html = await response.text();
      
      // 获取当前请求的基础URL
      const requestUrl = new URL(request.url);
      const proxyBase = `${requestUrl.protocol}//${requestUrl.host}/advanced-proxy?url=`;
      
      // 替换HTML中的链接
      html = replaceLinks(html, targetOrigin, proxyBase);
      
      // 返回修改后的HTML
      responseHeaders.set('Content-Type', 'text/html; charset=UTF-8');
      return new Response(html, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } else {
      // 对于非HTML内容，直接返回
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    }
  } catch (error) {
    // 错误处理
    console.error(`代理请求失败: ${error.message}`);
    return new Response(`代理请求失败: ${error.message}`, {
      status: 500,
      headers: {
        'Content-Type': 'text/plain; charset=UTF-8',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}

/**
 * 替换HTML中的链接，使其通过代理访问
 * @param {string} html - HTML内容
 * @param {string} targetOrigin - 目标网站的origin
 * @param {string} proxyBase - 代理基础URL
 * @returns {string} - 替换链接后的HTML
 */
function replaceLinks(html, targetOrigin, proxyBase) {
  // 替换绝对路径链接 (href="http://example.com/page")
  html = html.replace(/(href|src)=(["'])(https?:\/\/[^"']+)(["'])/gi, (match, attr, quote1, url, quote2) => {
    return `${attr}=${quote1}${proxyBase}${encodeURIComponent(url)}${quote2}`;
  });

  // 替换相对路径链接 (href="/page")
  html = html.replace(/(href|src)=(["'])(\/[^"']*)(["'])/gi, (match, attr, quote1, path, quote2) => {
    return `${attr}=${quote1}${proxyBase}${encodeURIComponent(targetOrigin + path)}${quote2}`;
  });

  // 替换相对路径链接 (href="page")
  html = html.replace(/(href|src)=(["'])(?!https?:\/\/)(?!\/)([\w\d\-\.\?\=\&]+)(["'])/gi, (match, attr, quote1, path, quote2) => {
    return `${attr}=${quote1}${proxyBase}${encodeURIComponent(targetOrigin + '/' + path)}${quote2}`;
  });

  // 替换CSS中的URL
  html = html.replace(/url\((["']?)([^)'"]+)(["']?)\)/gi, (match, quote1, url, quote2) => {
    if (url.startsWith('data:')) return match; // 不替换数据URL
    
    let fullUrl = url;
    if (url.startsWith('/')) {
      fullUrl = targetOrigin + url;
    } else if (!url.startsWith('http')) {
      fullUrl = targetOrigin + '/' + url;
    }
    
    return `url(${quote1}${proxyBase}${encodeURIComponent(fullUrl)}${quote2})`;
  });

  return html;
} 