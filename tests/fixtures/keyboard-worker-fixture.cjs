const { parentPort, workerData } = require('node:worker_threads');
parentPort.on('message', (request) => {
  const { id, operation } = request;
  if (workerData?.hang === operation) return;
  if (workerData?.crash === operation) { process.exit(3); return; }
  if (operation === 'frame' && workerData?.busyMs) {
    const until = Date.now() + workerData.busyMs;
    while (Date.now() < until) {} // Deliberately block this worker, not the parent thread.
  }
  parentPort.postMessage({ id, ok: true, ...(operation === 'open' ? { result: { keys: ['A', '1'], slotKeys: ['1'] } } : {}) });
});
