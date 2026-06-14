import type { TreeNode } from "@voice-industrial-design/shared";

import type { NodePalette, NodeUiMeta } from "./types";

const paletteCycle: NodePalette[] = ["teal", "amber", "blue", "sand", "mist"];

export function createNodeUiMeta(node: TreeNode, index: number): NodeUiMeta {
  const siblingsOffset = node.layerOrdinal - 1;
  const depthOffset = node.depth;

  return {
    palette: paletteCycle[index % paletteCycle.length],
    prompts: [
      `沿着节点 ${node.publicNodeNumber} 继续发散三个子方向`,
      `刷新节点 ${node.publicNodeNumber} 所在这一层`,
      "撤销上一步树操作"
    ],
    position: {
      x: 80 + depthOffset * 300,
      y: 70 + siblingsOffset * 190
    }
  };
}
