self.onmessage = function(e) {
  const { lpString, requestId } = e.data;
  // 模拟返回 Optimal，所有变量为 0
  const result = { Status: 'Optimal', Columns: {}, ObjectiveValue: 0 };
  self.postMessage({ requestId, result });
};