function init() {
  if (!self.Module) {
    importScripts('./highs.js');
  }
}

self.onmessage = async function(e) {
  try {
    init();
    const solver = await self.Module();
    const { lpString, requestId, options } = e.data;
    // 打印 LP 头部用于调试
    console.log('[Worker] LP 前500字符:', lpString.slice(0, 500));
    console.log('[Worker] LP 总长度:', lpString.length);
    const result = solver.solve(lpString, options || {});
    // 调试：打印状态
    console.log('[Worker] Solver Status:', result.Status);
    self.postMessage({ requestId, result });
  } catch (err) {
    console.error('[Worker] 求解器异常:', err);
    self.postMessage({
      requestId: e.data?.requestId,
      error: err.message || String(err)
    });
  }
};