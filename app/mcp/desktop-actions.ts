// Static Tauri builds have no Next.js server or stdio MCP runtime.
// Keep server actions out of the desktop bundle while preserving web behavior.
type Actions = typeof import("./actions");
const unavailable = async (..._args: unknown[]): Promise<never> => {
  throw new Error("桌面版尚未提供 MCP 运行时，请通过已部署的网页版使用 MCP。");
};
export const isMcpEnabled: Actions["isMcpEnabled"] = async () => false;
export const getAvailableClientsCount: Actions["getAvailableClientsCount"] =
  async () => 0;
export const getAllTools: Actions["getAllTools"] = async () => [];
export const getClientsStatus: Actions["getClientsStatus"] = async () => ({});
export const initializeMcpSystem: Actions["initializeMcpSystem"] = unavailable;
export const getClientTools: Actions["getClientTools"] = unavailable;
export const getMcpConfigFromFile: Actions["getMcpConfigFromFile"] =
  unavailable;
export const addMcpServer: Actions["addMcpServer"] = unavailable;
export const pauseMcpServer: Actions["pauseMcpServer"] = unavailable;
export const resumeMcpServer: Actions["resumeMcpServer"] = unavailable;
export const removeMcpServer: Actions["removeMcpServer"] = unavailable;
export const restartAllClients: Actions["restartAllClients"] = unavailable;
export const executeMcpAction: Actions["executeMcpAction"] = unavailable;
