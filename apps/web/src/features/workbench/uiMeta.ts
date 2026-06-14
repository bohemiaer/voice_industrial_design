import type { TreeNode } from "@voice-industrial-design/shared";

import type { NodePalette, NodeUiMeta } from "./types";

const paletteCycle: NodePalette[] = ["teal", "amber", "blue", "sand", "mist"];
const nodeHorizontalGap = 360;
const nodeVerticalGap = 440;
const nodeOrigin = { x: 80, y: 70 };

export function createNodePosition(
  depth: number,
  ordinal: number,
  layerCount = 1
) {
  return {
    x: nodeOrigin.x + (ordinal - (layerCount + 1) / 2) * nodeHorizontalGap,
    y: nodeOrigin.y + depth * nodeVerticalGap
  };
}

export function createNodeUiMeta(node: TreeNode, index: number): NodeUiMeta {
  return {
    palette: paletteCycle[index % paletteCycle.length],
    prompts: [
      `沿着节点 ${node.publicNodeNumber} 继续发散三个子方向`,
      `刷新节点 ${node.publicNodeNumber} 所在这一层`,
      "撤销上一步树操作"
    ],
    position: createNodePosition(node.depth, node.layerOrdinal)
  };
}
