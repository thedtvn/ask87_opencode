import { Plugin } from "@opencode/plugin";
import { acquireCoordinator } from "./coordinator.js";
import { Ask87Presence, parsePresence } from "./rpc.js";

export default Plugin.define({
  id: "ask87",
  async setup(ctx) {
    const { coordinator, release } = await acquireCoordinator();
    const detach = coordinator.attach(ctx);
    try {
      const registration = await ctx.rpc.register(Ask87Presence, {
        sync: async (input) => {
          await coordinator.presence(ctx, parsePresence(input));
          return { ok: true };
        },
      });
      return async () => {
        try { await registration.dispose(); }
        finally { try { await detach(); } finally { await release(); } }
      };
    } catch (error) {
      try { await detach(); } finally { await release(); }
      throw error;
    }
  },
});
