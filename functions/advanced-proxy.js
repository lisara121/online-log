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
    const targetHost = parsedTargetUrl.host;

    console.log(`高级代理请求: ${targetUrl}`);

    // 判断是否是资源文件请求
    const resourceExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot'];
    const isDirectResource = resourceExtensions.some(ext => targetUrl.toLowerCase().endsWith(ext));

    const headers = new Headers();
    const forwardHeaders = [
      'user-agent',
      'accept',
      'accept-language',
      'accept-encoding',
      'content-type',
      'referer',
      'cache-control'
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
      if (!['content-encoding', 'content-length', 'connection', 'transfer-encoding'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }

    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('X-Proxied-By', 'EdgeOne-Pages-Advanced-Proxy');

    const contentType = response.headers.get('content-type') || '';
    
    // 如果是HTML内容且不是直接资源请求，处理内部链接
    if (contentType.includes('text/html') && !isDirectResource) {
      let html = await response.text();
      
      const requestUrl = new URL(request.url);
      const proxyBase = `${requestUrl.protocol}//${requestUrl.host}/advanced-proxy?url=`;
      
      // 传递更多信息到替换函数
      html = replaceLinks(html, targetOrigin, proxyBase, targetPath, targetHost);
      
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
 * @param {string} targetHost - 目标网站的主机名
 * @returns {string} - 替换链接后的HTML
 */
function replaceLinks(html, targetOrigin, proxyBase, targetPath, targetHost) {
  // 获取当前目录路径（用于相对路径解析）
  const currentDir = targetPath.substring(0, targetPath.lastIndexOf('/') + 1);
  
  // 提取targetHost的主域名部分（用于判断子域名）
  const mainDomainParts = targetHost.split('.');
  const mainDomain = mainDomainParts.length >= 2 ? 
    `${mainDomainParts[mainDomainParts.length-2]}.${mainDomainParts[mainDomainParts.length-1]}` : 
    targetHost;

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
    
    // 检查是否包含子域名模式 (如 "subdomain.example.com/path")
    if (path.includes('.') && path.includes('/') && !path.startsWith('.')) {
      const potentialDomain = path.split('/')[0];
      if (potentialDomain.includes('.') && (potentialDomain.endsWith(mainDomain) || potentialDomain.includes('.'))) {
        // 这可能是一个子域名链接，应该作为绝对URL处理
        return `${attr}=${quote1}${proxyBase}${encodeURIComponent('https://' + path)}${quote2}`;
      }
    }
    
    // 正常处理相对路径
    const fullUrl = path.startsWith('?') 
      ? targetOrigin + targetPath + path 
      : targetOrigin + (currentDir + path).replace(/\/\.?\//g, '/').replace(/\/+/g, '/');
    
    return `${attr}=${quote1}${proxyBase}${encodeURIComponent(fullUrl)}${quote2}`;
  });

  // 替换CSS中的URL
  html = html.replace(/url\((["']?)([^)'"]+)(["']?)\)/gi, (match, quote1, url, quote2) => {
    // 不替换数据URL、锚点和已代理的URL
    if (url.startsWith('data:') || url.startsWith('#') || url.includes('/advanced-proxy?url=')) {
      return match;
    }
    
    // 处理不同类型的URL
    let fullUrl;
    
    // 处理绝对URL
    if (url.match(/^https?:\/\//i)) {
      fullUrl = url;
    }
    // 处理根相对路径
    else if (url.startsWith('/')) {
      fullUrl = targetOrigin + url;
    }
    // 检查是否是潜在的子域名路径
    else if (url.includes('.') && url.includes('/') && !url.startsWith('.')) {
      const potentialDomain = url.split('/')[0];
      if (potentialDomain.includes('.') && (potentialDomain.endsWith(mainDomain) || potentialDomain.includes('.'))) {
        // 子域名处理，假设是HTTPS
        fullUrl = 'https://' + url;
      } else {
        // 普通相对路径
        if (url.startsWith('./')) url = url.substring(2);
        fullUrl = targetOrigin + (currentDir + url).replace(/\/\.?\//g, '/').replace(/\/+/g, '/');
      }
    }
    // 处理普通相对路径
    else {
      if (url.startsWith('./')) url = url.substring(2);
      fullUrl = targetOrigin + (currentDir + url).replace(/\/\.?\//g, '/').replace(/\/+/g, '/');
    }
    
    return `url(${quote1}${proxyBase}${encodeURIComponent(fullUrl)}${quote2})`;
  });

  // 替换内联样式中的背景图片链接
  html = html.replace(/style=(["'])[^"']*background-image:\s*url\((["']?)([^)'"]+)(["']?)\)[^"']*(["'])/gi, 
    (match, quote1, imgQuote1, url, imgQuote2, quote2) => {
      if (url.startsWith('data:') || url.startsWith('#') || url.includes('/advanced-proxy?url=')) {
        return match;
      }

      let fullUrl;
      // 处理绝对URL
      if (url.match(/^https?:\/\//i)) {
        fullUrl = url;
      }
      // 处理根相对路径
      else if (url.startsWith('/')) {
        fullUrl = targetOrigin + url;
      }
      // 检查子域名模式
      else if (url.includes('.') && url.includes('/') && !url.startsWith('.')) {
        const potentialDomain = url.split('/')[0];
        if (potentialDomain.includes('.') && (potentialDomain.endsWith(mainDomain) || potentialDomain.includes('.'))) {
          fullUrl = 'https://' + url;
        } else {
          if (url.startsWith('./')) url = url.substring(2);
          fullUrl = targetOrigin + (currentDir + url).replace(/\/\.?\//g, '/').replace(/\/+/g, '/');
        }
      }
      // 处理普通相对路径
      else {
        if (url.startsWith('./')) url = url.substring(2);
        fullUrl = targetOrigin + (currentDir + url).replace(/\/\.?\//g, '/').replace(/\/+/g, '/');
      }

      return match.replace(url, `${proxyBase}${encodeURIComponent(fullUrl)}`);
    }
  );

  return html;
} 
