// GENFUN论坛 CORS代理 - Cloudflare Worker
// 用法: https://你的worker域名/?url=目标URL
// 支持 GET/POST/PUT/PATCH/DELETE，转发所有headers

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // 处理 OPTIONS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response('GENFUN CORS Proxy - 请提供 ?url= 参数', {
      status: 200,
      headers: { 'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 安全检查：只允许代理特定域名
  const allowedHosts = [
    'api.github.com',
    'github.com',
    'music.163.com',
    'api.bilibili.com',
    'api.geetest.com',
  ];

  try {
    const target = new URL(targetUrl);
    const isAllowed = allowedHosts.some(host => target.hostname === host || target.hostname.endsWith('.' + host));

    if (!isAllowed) {
      return new Response('🚫 不允许代理此域名', {
        status: 403,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
  } catch(e) {
    return new Response('❌ 无效的目标URL', {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    // 构建转发请求
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ipcountry');
    headers.delete('cf-ray');
    headers.delete('cf-visitor');
    headers.delete('cf-worker');

    const fetchOpts = {
      method: request.method,
      headers: headers,
      redirect: 'follow',
    };

    // 只对非GET/HEAD请求转发body
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      fetchOpts.body = request.body;
    }

    const response = await fetch(targetUrl, fetchOpts);

    // 构建响应，添加CORS头
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');
    newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    newHeaders.set('Access-Control-Allow-Headers', '*');
    newHeaders.delete('cf-cache-status');
    newHeaders.delete('cf-ray');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  } catch(error) {
    return new Response('❌ 代理请求失败: ' + error.message, {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' }
    });
  }
}
