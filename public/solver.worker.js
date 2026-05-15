// 模拟 Worker，不依赖任何外部文件，直接返回一个空的最优解
self.onmessage = function(e) {
  const { lpString, requestId } = e.data;
  // 构造一个空的成功结果（机器数全部为 0）
  const result = {
    Status: 'Optimal',
    Columns: {},
    ObjectiveValue: 0
  };
  self.postMessage({ requestId, result });
};