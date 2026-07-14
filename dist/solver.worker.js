function init() {
  if (!self.Module) {
    importScripts('./highs.js');
  }
}

// 缓存 solver 实例以支持 Worker 复用，避免每次求解都重新分配 2GB WASM
var solverInstance = null;
var solverReady = false;
var initPromise = null;

// ========== IndexedDB 缓存：避免每次访问都下载 3MB WASM ==========
var DB_NAME = 'solver-cache';
var DB_VERSION = 1;
var STORE_NAME = 'wasm';
var CACHE_VERSION_KEY = 'highs-wasm-v1';

function openDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(DB_NAME, DB_VERSION);
    var timeout = setTimeout(function() {
      reject(new Error('IndexedDB 打开超时'));
    }, 5000);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = function(e) {
      clearTimeout(timeout);
      resolve(e.target.result);
    };
    req.onerror = function(e) {
      clearTimeout(timeout);
      reject(e.target.error);
    };
  });
}

function getCachedWasm() {
  return openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      // 先检查版本号
      var txVer = db.transaction(STORE_NAME, 'readonly');
      var storeVer = txVer.objectStore(STORE_NAME);
      var verReq = storeVer.get(CACHE_VERSION_KEY);
      verReq.onsuccess = function() {
        if (verReq.result !== CACHE_VERSION_KEY) {
          // 版本不匹配，清除旧缓存
          db.close();
          clearOldCache().then(function() { resolve(null); });
          return;
        }
        // 版本匹配，读取 WASM
        var tx = db.transaction(STORE_NAME, 'readonly');
        var store = tx.objectStore(STORE_NAME);
        var wasmReq = store.get('wasm');
        wasmReq.onsuccess = function() {
          db.close();
          if (wasmReq.result) {
            console.log('[Worker] 从 IndexedDB 加载 WASM 缓存 (' +
              (wasmReq.result.byteLength / 1024 / 1024).toFixed(1) + ' MB)');
          }
          resolve(wasmReq.result || null);
        };
        wasmReq.onerror = function() { db.close(); resolve(null); };
      };
      verReq.onerror = function() { db.close(); resolve(null); };
    });
  }).catch(function(err) {
    console.warn('[Worker] IndexedDB 读取失败，将通过网络下载:', err.message);
    return null;
  });
}

function cacheWasm(buffer) {
  return openDB().then(function(db) {
    return new Promise(function(resolve, reject) {
      var tx = db.transaction(STORE_NAME, 'readwrite');
      var store = tx.objectStore(STORE_NAME);
      store.put(buffer, 'wasm');
      store.put(CACHE_VERSION_KEY, CACHE_VERSION_KEY);
      tx.oncomplete = function() {
        db.close();
        console.log('[Worker] WASM 已缓存到 IndexedDB (' +
          (buffer.byteLength / 1024 / 1024).toFixed(1) + ' MB)');
        resolve();
      };
      tx.onerror = function() { db.close(); reject(tx.error); };
    });
  }).catch(function(err) {
    console.warn('[Worker] IndexedDB 写入失败:', err.message);
  });
}

function clearOldCache() {
  return openDB().then(function(db) {
    var tx = db.transaction(STORE_NAME, 'readwrite');
    var store = tx.objectStore(STORE_NAME);
    store.clear();
    return new Promise(function(resolve) {
      tx.oncomplete = function() { db.close(); resolve(); };
      tx.onerror = function() { db.close(); resolve(); };
    });
  }).catch(function() {});
}

function getSolver() {
  if (solverReady && solverInstance) return Promise.resolve(solverInstance);
  if (initPromise) return initPromise;

  initPromise = self.Module({
    instantiateWasm: function(imports, successCallback) {
      var wasmURL = new URL('highs.wasm', self.location.href).href;

      function doInstantiate(binary) {
        return WebAssembly.instantiate(binary, imports).then(function(result) {
          var wasmInstance = result.instance;
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
          successCallback(wasmInstance);
        });
      }

      // 优先从 IndexedDB 读取缓存，未命中则网络下载
      return getCachedWasm().then(function(cached) {
        if (cached) {
          return doInstantiate(cached).catch(function(err) {
            // WASM 实例化失败（可能缓存损坏），清除缓存后重试网络下载
            console.warn('[Worker] 缓存 WASM 实例化失败，清除缓存并尝试网络下载:', err.message);
            return clearOldCache().then(function() {
              return fetch(wasmURL)
                .then(function(response) { return response.arrayBuffer(); })
                .then(function(buffer) {
                  cacheWasm(buffer);
                  return doInstantiate(buffer);
                });
            });
          });
        }
        console.log('[Worker] 未找到缓存，从网络下载 WASM...');
        return fetch(wasmURL)
          .then(function(response) { return response.arrayBuffer(); })
          .then(function(buffer) {
            // 异步写入缓存，不阻塞求解
            cacheWasm(buffer);
            return doInstantiate(buffer);
          });
      });
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
