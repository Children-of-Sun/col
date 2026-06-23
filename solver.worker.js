function init() {
  if (!self.Module) {
    importScripts('./highs.js');
  }
}

self.onmessage = async function(e) {
  try {
    init();

    // HiGHS 1.14+ instantiateWasm: 在 Emscripten 处理实例之前将 WASM 内存扩至 2GB
    // 内存导出名: 't' (1.14), 之前版本为 'v' (1.8)
    const solver = await self.Module({
      instantiateWasm: function(imports, successCallback) {
        const wasmURL = new URL('highs.wasm', self.location.href).href;

        function doInstantiate(binary) {
          return WebAssembly.instantiate(binary, imports).then(function(result) {
            // WebAssembly.instantiate 返回 {module, instance}
            var wasmInstance = result.instance;
            // 尝试多个可能的导出名 (v1.14='t', v1.8='v', standard='memory')
            var mem = wasmInstance.exports.t || wasmInstance.exports.v || wasmInstance.exports.memory;
            if (mem && typeof mem.grow === 'function') {
              var curBytes = mem.buffer.byteLength;
              var targetBytes = 2 * 1024 * 1024 * 1024; // 2GB
              if (curBytes < targetBytes) {
                var pagesToGrow = Math.floor((targetBytes - curBytes) / 65536);
                try {
                  mem.grow(pagesToGrow);
                  console.log('[Worker] WASM 内存: ' + (curBytes / 1024 / 1024).toFixed(0) +
                    'MB → ' + (mem.buffer.byteLength / 1024 / 1024 / 1024).toFixed(1) + 'GB');
                } catch (growErr) {
                  console.warn('[Worker] 内存扩容失败:', growErr.message);
                }
              }
            }
            // HiGHS 1.14: successCallback 签名为 (instance, module)
            successCallback(wasmInstance);
          });
        }

        return fetch(wasmURL)
          .then(function(response) { return response.arrayBuffer(); })
          .then(doInstantiate);
      }
    });

    const { lpString, requestId, options } = e.data;
    console.log('[Worker] LP 前500字符:', lpString.slice(0, 500));
    console.log('[Worker] LP 总长度:', lpString.length);
    var heap = solver.HEAP8 || solver.HEAPU8 || (typeof HEAP8 !== 'undefined' ? HEAP8 : null);
    if (heap) {
      console.log('[Worker] WASM 当前内存:', (heap.buffer.byteLength / 1024 / 1024 / 1024).toFixed(1), 'GB');
    } else {
      console.log('[Worker] Solver 已初始化 (v1.14)');
    }

    const result = solver.solve(lpString, options || {});
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
