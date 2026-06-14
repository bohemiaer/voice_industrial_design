import { BaseEdge, getBezierPath, type EdgeProps } from "@xyflow/react";

export function WorkbenchBezierEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX: sourceX + 8,
    sourceY,
    targetX: targetX - 8,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.32
  });

  return <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />;
}
