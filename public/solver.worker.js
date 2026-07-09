function init() {
  if (!self.Module) {
    importScripts('./highs.js');
  }
}

// 缓存 solver 实例以支持 Worker 复用，避免每次求解都重新分配 2GB WASM
var solverInstance = null;
var solverReady = false;
var initPromise = null;

function getSolver() {
  if (solverReady && solverInstance) return Promise.resolve(solverInstance);
  if (initPromise) return initPromise;

  initPromise = self.Module({
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
  }).then(function(solver) {
    solverInstance = solver;
    solverReady = true;
    initPromise = null;

    var heap = solver.HEAP8 || solver.HEAPU8 || (typeof HEAP8 !== 'undefined' ? HEAP8 : null);
    if (heap) {
      console.log('[Worker] WASM 当前内存:', (heap.buffer.byteLength / 1024 / 1024 / 1024).toFixed(1), 'GB');
    } else {
      console.log('[Worker] Solver 已初始化 (v1.14)');
    }
    return solver;
  }).catch(function(err) {
    initPromise = null;
    throw err;
  });

  return initPromise;
}

self.onmessage = async function(e) {
  try {
    init();

    const { lpString, requestId, options, generation } = e.data;
    console.log('[Worker] LP 前500字符:', lpString.slice(0, 500));
    console.log('[Worker] LP 总长度:', lpString.length);

    const solver = await getSolver();

    const result = solver.solve(lpString, options || {});
    console.log('[Worker] Solver Status:', result.Status);
    self.postMessage({ requestId, result, generation });
  } catch (err) {
    console.error('[Worker] 求解器异常:', err);
    self.postMessage({
      requestId: e.data?.requestId,
      error: err.message || String(err),
      generation: e.data?.generation,
    });
  }
};
