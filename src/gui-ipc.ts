import { Ipc } from "@opencode/plugin/gui";
import { Schema } from "effect";
export const KeyboardIPC = Ipc.define({
  id: "ask87_opencode.keyboard",
  methods: { sync: { input: Schema.Unknown, output: Schema.Boolean } },
});
