function init() {
  if (!self.Module) {
    // 使用 CDN 上的 HiGHS（确保支持跨域）
    importScripts('https://cdn.jsdelivr.net/npm/highs@1.5.1/highs.js');
  }
}

self.onmessage = async function(e) {
  try {
    init();
    const solver = await self.Module();
    const { lpString, requestId } = e.data;
    const result = solver.solve(lpString);
    self.postMessage({ requestId, result });
  } catch (err) {
    self.postMessage({
      requestId: e.data?.requestId,
      error: err.message || String(err)
    });
  }
};