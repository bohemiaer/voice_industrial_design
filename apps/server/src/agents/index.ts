import type { AppConfig } from "../config.js";
import { MockAgentGateway } from "./mock.js";
import { SiliconFlowAgentGateway } from "./siliconflow.js";
import type { AgentGateway } from "./types.js";

export function createAgentGateway(config: AppConfig): AgentGateway {
  if (config.agentProvider === "siliconflow") {
    return new SiliconFlowAgentGateway(config);
  }

  return new MockAgentGateway();
}
