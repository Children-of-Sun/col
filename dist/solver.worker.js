function init() {
  if (!self.Module) {
    importScripts('./highs.js');
  }
}

self.onmessage = async function(e) {
  try {
    init();
    const solver = await self.Module();
    const { lpString, requestId } = e.data;
    const result = solver.solve(lpString);
    // 调试：打印状态
    console.log('[Worker] Solver Status:', result.Status);
    self.postMessage({ requestId, result });
  } catch (err) {
    self.postMessage({
      requestId: e.data?.requestId,
      error: err.message || String(err)
    });
  }
};