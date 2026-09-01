import { handleGoldRequest } from "../../src/gold-api.js";

export async function onRequest(context) {
  return handleGoldRequest(context.env);
}
