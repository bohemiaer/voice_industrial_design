import type { TreeNode } from "@voice-industrial-design/shared";

import type { NodePalette, NodeUiMeta } from "./types";

const paletteCycle: NodePalette[] = ["teal", "amber", "blue", "sand", "mist"];
const nodeHorizontalGap = 360;
const nodeVerticalGap = 440;
const nodeOrigin = { x: 80, y: 70 };
const siblingGapUnits = 120;
const minimumCollisionGap = 240;

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

export function createSymmetricTreeLayout(
  nodes: TreeNode[]
): Map<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childMap = new Map<string, TreeNode[]>();

  for (const node of nodes) {
    if (!node.parentNodeId) {
      continue;
    }

    const siblings = childMap.get(node.parentNodeId) ?? [];
    siblings.push(node);
    childMap.set(node.parentNodeId, siblings);
  }

  for (const siblings of childMap.values()) {
    siblings.sort((left, right) => {
      if (left.layerOrdinal !== right.layerOrdinal) {
        return left.layerOrdinal - right.layerOrdinal;
      }

      return left.publicNodeNumber - right.publicNodeNumber;
    });
  }

  const rootNode = [...nodes].sort((left, right) => left.depth - right.depth)[0];

  if (!rootNode) {
    return new Map();
  }

  const spanCache = new Map<string, number>();
  const positions = new Map<string, { x: number; y: number }>();

  const assignSubtree = (nodeId: string, parentCenterX: number) => {
    const node = byId.get(nodeId);

    if (!node) {
      return;
    }

    positions.set(nodeId, {
      x: parentCenterX,
      y: nodeOrigin.y + node.depth * nodeVerticalGap
    });

    const children = childMap.get(nodeId) ?? [];

    if (children.length === 0) {
      return;
    }

    const childSpans = children.map((child) =>
      measureSubtreeSpan(child.id, childMap, spanCache)
    );
    const totalChildrenSpan =
      childSpans.reduce((sum, span) => sum + span, 0) +
      siblingGapUnits * Math.max(0, children.length - 1);

    let cursor = parentCenterX - totalChildrenSpan / 2;

    children.forEach((child, index) => {
      const childSpan = childSpans[index];
      const childCenterX = cursor + childSpan / 2;
      assignSubtree(child.id, childCenterX);
      cursor = childCenterX + childSpan / 2 + siblingGapUnits;
    });
  };

  assignSubtree(rootNode.id, nodeOrigin.x);
  resolveDepthCollisions(rootNode.id, childMap, positions);

  return positions;
}

function measureSubtreeSpan(
  nodeId: string,
  childMap: Map<string, TreeNode[]>,
  spanCache: Map<string, number>
): number {
  const cached = spanCache.get(nodeId);

  if (cached) {
    return cached;
  }

  const children = childMap.get(nodeId) ?? [];

  if (children.length === 0) {
    spanCache.set(nodeId, nodeHorizontalGap);
    return nodeHorizontalGap;
  }

  const totalChildrenSpan =
    children.reduce(
      (sum, child) => sum + measureSubtreeSpan(child.id, childMap, spanCache),
      0
    ) + siblingGapUnits * Math.max(0, children.length - 1);

  const span = Math.max(nodeHorizontalGap, totalChildrenSpan);
  spanCache.set(nodeId, span);
  return span;
}

function resolveDepthCollisions(
  rootNodeId: string,
  childMap: Map<string, TreeNode[]>,
  positions: Map<string, { x: number; y: number }>
): void {
  const depthGroups = new Map<number, string[]>();

  for (const [nodeId, position] of positions) {
    const depth = Math.round((position.y - nodeOrigin.y) / nodeVerticalGap);
    const group = depthGroups.get(depth) ?? [];
    group.push(nodeId);
    depthGroups.set(depth, group);
  }

  for (const nodeIds of depthGroups.values()) {
    nodeIds.sort(
      (left, right) =>
        (positions.get(left)?.x ?? 0) - (positions.get(right)?.x ?? 0)
    );

    for (let index = 1; index < nodeIds.length; index += 1) {
      const previousNodeId = nodeIds[index - 1];
      const currentNodeId = nodeIds[index];
      const previousX = positions.get(previousNodeId)?.x ?? 0;
      const currentX = positions.get(currentNodeId)?.x ?? 0;
      const gap = currentX - previousX;

      if (gap >= minimumCollisionGap) {
        continue;
      }

      const delta = minimumCollisionGap - gap;
      shiftNodeAtCurrentDepth(currentNodeId, delta, positions);
    }
  }

  if (!positions.has(rootNodeId)) {
    return;
  }

  const rootPosition = positions.get(rootNodeId);

  if (!rootPosition) {
    return;
  }

  const delta = nodeOrigin.x - rootPosition.x;

  if (delta !== 0) {
    shiftWholeLayout(delta, positions);
  }
}

function shiftNodeAtCurrentDepth(
  nodeId: string,
  deltaX: number,
  positions: Map<string, { x: number; y: number }>
): void {
  const position = positions.get(nodeId);

  if (position) {
    position.x += deltaX;
  }
}

function shiftWholeLayout(
  deltaX: number,
  positions: Map<string, { x: number; y: number }>
): void {
  for (const position of positions.values()) {
    position.x += deltaX;
  }
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
