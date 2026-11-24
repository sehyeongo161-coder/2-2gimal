/* Installation support only: never cache quiz, authentication, or progress data. */
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));
const offlinePage = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>인터넷 연결 필요</title><style>body{font:16px system-ui,sans-serif;background:#f6f8fb;color:#202e42;margin:0;padding:10vh 24px}main{max-width:420px;margin:auto;background:white;border:1px solid #e0e6ee;border-radius:16px;padding:24px}a{display:inline-block;color:white;background:#244d83;padding:10px 18px;border-radius:9px;text-decoration:none}</style></head><body><main><h1>인터넷 연결이 필요합니다.</h1><p>최신 시험 범위 및 Firebase 학습 기록을 안전하게 불러오기 위해 인터넷에 연결한 후 다시 접속해 주세요.</p><a href="./">다시 접속</a></main></body></html>`;
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate" || !request.url.startsWith(self.registration.scope)) return;
  event.respondWith(fetch(request, {cache:"no-cache"}).catch(() => new Response(offlinePage, {status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"}})));
});
