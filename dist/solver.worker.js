// 经典 Worker，使用 importScripts 加载 highs.js
function init() {
  // 确保 highs.js 只加载一次
  if (!self.Module) {
    importScripts('/highs.js');
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