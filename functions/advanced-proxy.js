export async function onRequest({ request }) {
  try {
    const url = new URL(request.url);
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
      return new Response('缺少目标URL参数', {
        status: 400,
        headers: { 'Content-Type': 'text/plain; charset=UTF-8' }
      });
    }

    const parsedTargetUrl = new URL(targetUrl);
    const targetOrigin = parsedTargetUrl.origin;
    const targetPath = parsedTargetUrl.pathname;

    console.log(`高级代理请求: ${targetUrl}`);

    const resourceExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot'];
    const isDirectResource = resourceExtensions.some(ext => targetUrl.toLowerCase().endsWith(ext));

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

    const targetRequest = new Request(targetUrl, {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.blob() : undefined,
      redirect: 'follow',
    });

    const response = await fetch(targetRequest);

    const responseHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      if (!['content-encoding', 'content-length', 'connection'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }

    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('X-Proxied-By', 'EdgeOne-Pages-Advanced-Proxy');

    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('text/html') && !isDirectResource) {
      let html = await response.text();
      
      const requestUrl = new URL(request.url);
      const proxyBase = `${requestUrl.protocol}//${requestUrl.host}/advanced-proxy?url=`;
      
      html = replaceLinks(html, targetOrigin, proxyBase, targetPath);
      
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
 * @param {string} targetPath - 目标网站的路径
 * @returns {string} - 替换链接后的HTML
 */
function replaceLinks(html, targetOrigin, proxyBase, targetPath) {
  // 获取当前目录路径（用于相对路径解析）
  const currentDir = targetPath.substring(0, targetPath.lastIndexOf('/') + 1);

  // 替换绝对路径链接 (href="http://example.com/page")
  html = html.replace(/(href|src)=(["'])(https?:\/\/[^"']+)(["'])/gi, (match, attr, quote1, url, quote2) => {
    // 避免重复代理已经是代理URL的链接
    if (url.includes('/advanced-proxy?url=')) return match;
    return `${attr}=${quote1}${proxyBase}${encodeURIComponent(url)}${quote2}`;
  });

  // 替换根相对路径链接 (href="/page")
  html = html.replace(/(href|src)=(["'])(\/[^"']*)(["'])/gi, (match, attr, quote1, path, quote2) => {
    return `${attr}=${quote1}${proxyBase}${encodeURIComponent(targetOrigin + path)}${quote2}`;
  });

  // 替换相对路径链接 (href="page" 或 href="./page")
  html = html.replace(/(href|src)=(["'])(?!https?:\/\/)(?!\/)(?!#)(?!javascript:)(?!data:)([^"']+)(["'])/gi, (match, attr, quote1, path, quote2) => {
    // 如果路径以./开头，移除./
    if (path.startsWith('./')) {
      path = path.substring(2);
    }
    // 构建完整的URL
    const fullUrl = path.startsWith('?') 
      ? targetOrigin + targetPath + path 
      : targetOrigin + (currentDir + path).replace(/\/\.?\//g, '/');
    
    return `${attr}=${quote1}${proxyBase}${encodeURIComponent(fullUrl)}${quote2}`;
  });

  // 替换CSS中的URL
  html = html.replace(/url\((["']?)([^)'"]+)(["']?)\)/gi, (match, quote1, url, quote2) => {
    // 不替换数据URL和已经是代理URL的链接
    if (url.startsWith('data:') || url.startsWith('#') || url.includes('/advanced-proxy?url=')) {
      return match;
    }
    
    let fullUrl = url;
    // 处理绝对URL
    if (url.match(/^https?:\/\//i)) {
      fullUrl = url;
    }
    // 处理根相对路径
    else if (url.startsWith('/')) {
      fullUrl = targetOrigin + url;
    }
    // 处理相对路径
    else {
      // 如果路径以./开头，移除./
      if (url.startsWith('./')) {
        url = url.substring(2);
      }
      fullUrl = targetOrigin + (currentDir + url).replace(/\/\.?\//g, '/');
    }
    
    return `url(${quote1}${proxyBase}${encodeURIComponent(fullUrl)}${quote2})`;
  });

  // 替换内联样式中的背景图片链接
  html = html.replace(/style=(["'])[^"']*background-image:\s*url\((["']?)([^)'"]+)(["']?)\)[^"']*(["'])/gi, 
    (match, quote1, imgQuote1, url, imgQuote2, quote2) => {
      if (url.startsWith('data:') || url.startsWith('#') || url.includes('/advanced-proxy?url=')) {
        return match;
      }

      let fullUrl = url;
      if (url.match(/^https?:\/\//i)) {
        fullUrl = url;
      } else if (url.startsWith('/')) {
        fullUrl = targetOrigin + url;
      } else {
        if (url.startsWith('./')) {
          url = url.substring(2);
        }
        fullUrl = targetOrigin + (currentDir + url).replace(/\/\.?\//g, '/');
      }

      return match.replace(url, `${proxyBase}${encodeURIComponent(fullUrl)}`);
    }
  );

  return html;
} 
