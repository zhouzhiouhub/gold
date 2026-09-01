import { handleGoldRequest } from "./gold-api.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/gold") {
      return handleGoldRequest(env);
    }
    return env.ASSETS.fetch(request);
  },
};
