const routes = [];

export function register(pattern, handler) {
  // Convert :param placeholders to named capture groups
  const regexStr = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape special chars
    .replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '(?<$1>[^/]+)');
  routes.push({ pattern: new RegExp(`^${regexStr}$`), handler });
}

function matchRoute(path) {
  for (const route of routes) {
    const m = path.match(route.pattern);
    if (m) {
      return { handler: route.handler, params: m.groups || {} };
    }
  }
  return null;
}

async function dispatch() {
  const hash = location.hash.slice(1) || '/';
  const path = hash.split('?')[0];
  const matched = matchRoute(path);
  const root = document.getElementById('page-root');
  if (!matched) {
    root.innerHTML = `<div class="empty">404 — Sayfa bulunamadı: <code>${path}</code></div>`;
    return;
  }
  try {
    await matched.handler(matched.params);
  } catch (err) {
    console.error('Route error:', err);
    root.innerHTML = `<div class="empty text-danger">Hata: ${err.message}</div>`;
  }
}

export function start() {
  window.addEventListener('hashchange', dispatch);
  dispatch();
}

export function navigate(path) {
  location.hash = path;
}
