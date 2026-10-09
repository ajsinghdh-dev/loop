const V='loop-v8';const A=['/','/index.html','/app.js','/data.js','/math.js','/manifest.json','/icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(A)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))));self.clients.claim()});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin)return;e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});

self.addEventListener('push',e=>{let m={};try{m=e.data?e.data.json():{}}catch{m={title:e.data&&e.data.text()}}
 const title=m.title||'Loop';e.waitUntil(self.registration.showNotification(title,{body:m.body||'',icon:'/icon-192.png',badge:'/icon-192.png',tag:m.tag||undefined,data:{url:m.url||'/'}}))});
self.addEventListener('notificationclick',e=>{e.notification.close();const url=(e.notification.data&&e.notification.data.url)||'/';
 e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(ws=>{for(const w of ws){if('focus'in w){if(url!=='/'&&'navigate'in w)w.navigate(url);return w.focus()}}return clients.openWindow(url)}))});
self.addEventListener('pushsubscriptionchange',()=>{}); // the app re-subscribes on next open
