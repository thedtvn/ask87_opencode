"use strict";
const { parentPort } = require("node:worker_threads");
if (!parentPort) throw new Error("Keyboard worker requires a parent port");
let keyboard;
let chain = Promise.resolve();

parentPort.on("message", (request) => {
  chain = chain.then(async () => {
    const { id, operation } = request;
    try {
      let result;
      if (operation === "open") {
        const { Keyboard, Key } = require("../vendor/attack-shark-x87");
        if (!keyboard) keyboard = await Keyboard.openAsync();
        result = { keys: Object.values(Key), slotKeys: [Key.DIGIT_1, Key.DIGIT_2, Key.DIGIT_3, Key.DIGIT_4, Key.DIGIT_5, Key.DIGIT_6, Key.DIGIT_7, Key.DIGIT_8, Key.DIGIT_9, Key.DIGIT_0] };
      } else if (!keyboard) throw new Error("Not open");
      else if (operation === "frame") await keyboard.sendFrame(new Map(request.frame));
      else if (operation === "stop") await keyboard.stopRealtime();
      else if (operation === "close") { keyboard.close(); keyboard = undefined; }
      else throw new Error("Invalid operation");
      parentPort.postMessage({ id, ok: true, ...(result ? { result } : {}) });
    } catch {
      // Never forward native error messages: they may include machine paths or device metadata.
      parentPort.postMessage({ id, ok: false, errorCode: "keyboard_operation_failed" });
    }
  });
});
process.on("exit", () => { try { keyboard?.close(); } catch {} });
