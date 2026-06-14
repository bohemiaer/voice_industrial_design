import type {
  BranchTask,
  GenerationTask,
  Message,
  Session,
  TreeNode,
  TreeOperation,
  VisualDirectionBrief
} from "@voice-industrial-design/shared";

import type {
  MessageDecoration,
  NodeUiMeta,
  PendingAction,
  WorkbenchFixture,
  WorkbenchScenarioId
} from "./types";

const iso = (time: string) => `2026-06-13T${time}+08:00`;

const baseSession = (overrides: Partial<Session>): Session => ({
  id: "session-01",
  title: "便携补光设备脑暴",
  goal: "为城市通勤者探索轻便、克制且有专业器材感的手持补光设备方向。",
  productDomain: "industrial_design",
  activeNodeId: "node-3",
  pendingNodeId: null,
  lastMentionedNodeId: "node-3",
  nextPublicNodeNumber: 13,
  createdAt: iso("00:00:00"),
  updatedAt: iso("00:08:00"),
  ...overrides
});

const createNode = (
  id: string,
  parentNodeId: string | null,
  depth: number,
  displayName: string,
  publicNodeNumber: number,
  layerOrdinal: number,
  intentSummary: string,
  formLanguage: string[],
  userNeedResponse: string[],
  inspirationHints: string[],
  status: TreeNode["status"] = "ready"
): TreeNode => ({
  id,
  sessionId: "session-01",
  parentNodeId,
  depth,
  displayName,
  label: displayName.toLowerCase().replace(/\s+/g, "-"),
  publicNodeNumber,
  layerOrdinal,
  layerVersion: 1,
  voiceAliases: [displayName, `节点${publicNodeNumber}`, `NODE ${publicNodeNumber}`],
  intentSummary,
  formLanguage,
  userNeedResponse,
  inspirationHints,
  imageUrl: null,
  status,
  createdAt: iso("00:01:00"),
  updatedAt: iso("00:08:00")
});

const createBrief = (
  briefId: string,
  targetParentNodeId: string,
  displayName: string,
  publicNodeNumber: number,
  variationAxis: string
): VisualDirectionBrief => ({
  briefId,
  targetParentNodeId,
  publicNodeNumber,
  label: displayName.toLowerCase().replace(/\s+/g, "-"),
  displayName,
  intentSummary: `${displayName}，围绕 ${variationAxis} 做更明确的造型变化。`,
  formLanguage: [variationAxis, "器材感", "轻便"],
  userNeedResponse: ["便于携带", "更容易理解差异"],
  inspirationHints: ["消费电子", "摄影器材"],
  variationAxis,
  promptIntent: `围绕 ${displayName} 生成一个更聚焦 ${variationAxis} 的工业设计方向`
});

const createBranchTask = (
  id: string,
  generationTaskId: string,
  brief: VisualDirectionBrief,
  status: BranchTask["status"],
  imageUrl: string | null = null
): BranchTask => ({
  id,
  generationTaskId,
  brief,
  status,
  imageUrl,
  errorMessage: null,
  createdAt: iso("00:02:00"),
  updatedAt: iso("00:08:00")
});

const createTask = (
  id: string,
  actionType: GenerationTask["actionType"],
  targetNodeId: string,
  status: GenerationTask["status"],
  confirmationRequired: boolean,
  confirmationStatus: GenerationTask["confirmationStatus"],
  branchCount: number,
  transcriptText: string,
  designIntentSummary: string,
  branchTasks: BranchTask[] = [],
  rewrittenIntentForConfirmation: string | null = null
): GenerationTask => ({
  id,
  sessionId: "session-01",
  actionType,
  targetNodeId,
  status,
  confirmationRequired,
  confirmationStatus,
  rewrittenIntentForConfirmation,
  branchCount,
  transcriptText,
  designIntentSummary,
  branchTasks,
  createdAt: iso("00:02:00"),
  updatedAt: iso("00:08:00")
});

const createMessage = (
  id: string,
  role: Message["role"],
  kind: Message["kind"],
  content: string,
  createdAt: string,
  taskId: string | null = null
): Message => ({
  id,
  sessionId: "session-01",
  taskId,
  role,
  kind,
  content,
  createdAt: iso(createdAt)
});

const rootNode = createNode(
  "root",
  null,
  0,
  "启动：便携补光设备",
  1,
  1,
  "用于项目 kickoff 的初始需求，强调通勤场景下的轻便、克制与器材可靠感。",
  ["轻便", "克制", "器材感"],
  ["便于通勤携带", "保持专业可靠印象"],
  ["摄影器材", "紧凑型电子设备"]
);

const firstLayerNodes: TreeNode[] = [
  rootNode,
  createNode(
    "node-2",
    "root",
    1,
    "折线工具感",
    2,
    1,
    "强调结构分件与防护包边，轮廓更硬朗，更偏工具级可靠感。",
    ["折线", "硬朗", "防护"],
    ["更耐用", "更专业"],
    ["户外工具", "工业设备"]
  ),
  createNode(
    "node-3",
    "root",
    1,
    "极简器材感",
    3,
    2,
    "主体表面更完整，减少切线与装饰，像消费电子与摄影器材之间的折中语言。",
    ["完整表面", "简洁", "器材感"],
    ["更轻便", "更干净", "仍然可靠"],
    ["消费电子", "摄影器材"]
  ),
  createNode(
    "node-4",
    "root",
    1,
    "柔和居家化",
    4,
    3,
    "边角更圆润，CMF 更轻，适合强调友好感与低门槛上手体验。",
    ["圆润", "柔和", "亲和"],
    ["容易上手", "日常友好"],
    ["桌面家居", "生活电器"]
  ),
  createNode(
    "node-5",
    "root",
    1,
    "模块拼接感",
    5,
    4,
    "通过体块组合与磁吸拼接暗示专业扩展能力，适合强调系统化使用场景。",
    ["模块化", "拼接", "扩展"],
    ["后续扩展", "品牌识别"],
    ["专业配件", "模组设备"]
  )
];

const deeperLayerNodes: TreeNode[] = [
  ...firstLayerNodes,
  createNode(
    "node-6",
    "node-3",
    2,
    "收窄握把",
    6,
    1,
    "通过中段收腰和更明确的拇指停靠位置，强化单手握持的安全感与控制感。",
    ["收腰", "握持引导", "安全感"],
    ["单手稳固", "长时间握持"],
    ["手柄设备", "掌心定位"]
  ),
  createNode(
    "node-7",
    "node-3",
    2,
    "纯平轮廓",
    7,
    2,
    "整体更贴近口袋化设备，造型更克制，但通过边缘厚度保留器材级支撑感。",
    ["纯平", "克制", "薄型"],
    ["更易携带", "保持稳固"],
    ["口袋设备", "平板边缘"]
  ),
  createNode(
    "node-8",
    "node-3",
    2,
    "扫描倾角",
    8,
    3,
    "通过带倾角的上表面引导持握方向，让设备既显得轻薄，又更容易建立手势安全感。",
    ["倾角", "导向", "稳握"],
    ["更稳手", "更明确的使用姿态"],
    ["扫描仪", "手持终端"],
    "generating"
  )
];

const refreshedLayerNodes: TreeNode[] = [
  rootNode,
  createNode(
    "node-9",
    "root",
    1,
    "轻薄器材感",
    9,
    1,
    "保留器材可靠感的同时进一步压薄主体比例，更接近消费电子的轻盈印象。",
    ["轻薄", "器材感", "完整表面"],
    ["减轻负担", "保留专业感"],
    ["超薄设备", "摄影手柄"]
  ),
  createNode(
    "node-10",
    "root",
    1,
    "稳握平衡感",
    10,
    2,
    "通过配重和握把几何重构平衡感，让手持稳定性成为新的第一性卖点。",
    ["稳握", "平衡", "掌心支撑"],
    ["长时间使用", "姿态更稳定"],
    ["工具手柄", "人体工学器材"]
  ),
  createNode(
    "node-11",
    "root",
    1,
    "桌面转译感",
    11,
    3,
    "把桌面补光的秩序感转译到手持版本中，适合家居场景与轻办公场景。",
    ["桌面化", "秩序感", "轻办公"],
    ["更日常", "更安静的存在感"],
    ["桌面灯具", "生活电器"]
  ),
  createNode(
    "node-12",
    "root",
    1,
    "模块磁吸感",
    12,
    4,
    "强调磁吸扩展与快速拆装，适合未来做配件生态的主视觉方向。",
    ["磁吸", "模块", "扩展生态"],
    ["快速切换", "后续配件延展"],
    ["模组设备", "磁吸配件"]
  )
];

const nodeUiMeta: Record<string, NodeUiMeta> = {
  root: {
    palette: "teal",
    prompts: ["读一下当前层", "再给我 2 个更偏专业器材感的方向", "整体更轻一点"],
    position: { x: 80, y: 220 }
  },
  "node-2": {
    palette: "amber",
    prompts: ["沿着节点 2 继续发散", "保留方向但更精致一点", "读一下这个方向的特点"],
    position: { x: 480, y: 36 }
  },
  "node-3": {
    palette: "blue",
    prompts: ["沿着节点 3 继续发散", "保留数量但更轻薄一点", "做一个带握持倾角的方向"],
    position: { x: 480, y: 248 }
  },
  "node-4": {
    palette: "sand",
    prompts: ["选节点 4", "让它更适合卧室和桌面环境", "再柔和一点但别太家电化"],
    position: { x: 480, y: 460 }
  },
  "node-5": {
    palette: "teal",
    prompts: ["选节点 5", "强化扩展能力", "做一个更像配件系统的版本"],
    position: { x: 480, y: 672 }
  },
  "node-6": {
    palette: "teal",
    prompts: ["继续沿着节点 6 做 3 个子方向", "更适合长时间单手握持", "保持结构但更圆润一点"],
    position: { x: 900, y: 130 }
  },
  "node-7": {
    palette: "mist",
    prompts: ["选节点 7", "保留纯平轮廓但更稳手", "做两个更有品牌气质的方向"],
    position: { x: 900, y: 330 }
  },
  "node-8": {
    palette: "ghost",
    prompts: ["撤销上一轮", "读一下当前状态", "如果不对就取消这一轮"],
    position: { x: 900, y: 530 }
  },
  "node-9": {
    palette: "blue",
    prompts: ["选节点 9", "再薄一点", "更像消费电子"],
    position: { x: 480, y: 36 }
  },
  "node-10": {
    palette: "teal",
    prompts: ["选节点 10", "强调握持平衡", "让器材感更强一点"],
    position: { x: 480, y: 248 }
  },
  "node-11": {
    palette: "sand",
    prompts: ["选节点 11", "更适合桌面与家居", "更柔和一些"],
    position: { x: 480, y: 460 }
  },
  "node-12": {
    palette: "amber",
    prompts: ["选节点 12", "强调磁吸配件系统", "让扩展线更明确"],
    position: { x: 480, y: 672 }
  }
};

const branchReviewPendingAction: PendingAction = {
  kind: "task_confirmation",
  taskId: "task-branch-review",
  title: "确认继续沿 3 号节点向下探索",
  description: "系统识别到你要沿节点 3 深入生成 3 个子方向，并加入“更极简、保留握持安全感”的约束。",
  confirmLabel: "确认继续",
  cancelLabel: "取消这轮"
};

const undoPendingAction: PendingAction = {
  kind: "undo",
  operationId: "op-branch-01",
  title: "确认撤销最近一次分支下钻",
  description: "撤销会移除节点 6、7、8，并将当前树恢复到第一层 4 个方向的状态。",
  confirmLabel: "确认撤销",
  cancelLabel: "保留当前树"
};

const branchBriefs = [
  createBrief("brief-1", "node-3", "收窄握把", 6, "更稳的单手握持"),
  createBrief("brief-2", "node-3", "纯平轮廓", 7, "更口袋化的纯平边缘"),
  createBrief("brief-3", "node-3", "扫描倾角", 8, "通过倾角引导姿态")
];

const firstLayerMessages: Message[] = [
  createMessage(
    "m1",
    "user",
    "transcript",
    "我们要做一款给城市通勤者用的手持补光设备，最好轻便、克制，但拿在手里要有一点专业器材感。",
    "00:01:00"
  ),
  createMessage("m2", "system", "status", "已运行 2 条命令", "00:01:10", "task-root"),
  createMessage(
    "m3",
    "assistant",
    "summary",
    "我先沿着便携感、器材感、亲和度和扩展性四个轴向发散，生成了第一层 4 个概念方向。",
    "00:01:20",
    "task-root"
  )
];

const branchReviewMessages: Message[] = [
  ...firstLayerMessages,
  createMessage(
    "m4",
    "user",
    "transcript",
    "选节点 3，再往下做几个更偏极简科技、但保留握持安全感的子方向。",
    "00:02:00"
  ),
  createMessage("m5", "system", "status", "已运行 3 条命令", "00:02:08", "task-branch-review"),
  createMessage(
    "m6",
    "assistant",
    "confirmation",
    "意图识别：沿着 3 号节点继续向下探索，并加入“更极简、保留握持安全感”的约束。确认后将新增 3 个子方向。",
    "00:02:14",
    "task-branch-review"
  )
];

const deeperLayerMessages: Message[] = [
  ...branchReviewMessages,
  createMessage("m7", "user", "transcript", "确认，继续。", "00:02:20"),
  createMessage("m8", "system", "status", "已运行 5 条命令", "00:02:28", "task-branch-generate"),
  createMessage(
    "m9",
    "assistant",
    "summary",
    "已经沿节点 3 下钻生成 3 个子方向，其中 2 个完成，1 个仍在出图中。",
    "00:02:32",
    "task-branch-generate"
  )
];

const refreshMessages: Message[] = [
  ...deeperLayerMessages,
  createMessage("m10", "user", "transcript", "保留数量，刷新第一层，让整体更轻、更易携带。", "00:04:00"),
  createMessage("m11", "system", "status", "已运行 7 条命令", "00:04:09", "task-refresh"),
  createMessage(
    "m12",
    "assistant",
    "summary",
    "我已按“更轻、更易携带”的要求刷新第一层，保留 4 个方向但更新了重点表达。",
    "00:04:18",
    "task-refresh"
  )
];

const undoMessages: Message[] = [
  ...deeperLayerMessages,
  createMessage("m13", "user", "transcript", "撤销上一轮。", "00:05:10"),
  createMessage("m14", "system", "status", "最近一次树操作可撤销", "00:05:15"),
  createMessage(
    "m15",
    "assistant",
    "confirmation",
    "最近一次操作是沿节点 3 下钻生成 3 个子方向。确认后会回退到第一层 4 个方向的状态。",
    "00:05:18"
  )
];

const messageDecorations: Record<string, MessageDecoration> = {
  m2: {
    summary: "已运行 2 条命令",
    details: "已根据初始需求创建根节点，并生成第一层 4 个概念方向。"
  },
  m3: {
    actionType: "expand_branches"
  },
  m5: {
    summary: "已运行 3 条命令",
    details: "已选中 NODE 3，并准备沿该节点继续下钻生成 3 个子方向。",
    defaultOpen: true
  },
  m6: {
    actionType: "branch_deeper"
  },
  m8: {
    summary: "已运行 5 条命令",
    details: "正在生成节点 8。系统消息在运行中默认展开，完成后会自动折叠为摘要。",
    defaultOpen: true
  },
  m9: {
    actionType: "branch_deeper"
  },
  m11: {
    summary: "已运行 7 条命令",
    details: "已刷新第一层方向，旧的第一层节点会被整层替换成新的 4 个方向。"
  },
  m12: {
    actionType: "refresh_layer"
  },
  m14: {
    summary: "最近一次树操作可撤销",
    details: "当前可回退的树操作为：沿 NODE 3 生成 3 个下钻方向。",
    defaultOpen: true
  },
  m15: {
    actionType: "branch_deeper"
  }
};

const tasks: Record<string, GenerationTask> = {
  root: createTask(
    "task-root",
    "expand_branches",
    "root",
    "completed",
    false,
    "not_required",
    4,
    firstLayerMessages[0].content,
    "生成第一层 4 个差异明确的概念方向"
  ),
  branchReview: createTask(
    "task-branch-review",
    "branch_deeper",
    "node-3",
    "awaiting_confirmation",
    true,
    "awaiting_confirmation",
    3,
    branchReviewMessages[3].content,
    "沿着极简器材感方向继续下钻，加入握持安全感约束",
    [],
    "沿节点 3 向下探索，并加入“更极简、保留握持安全感”的约束"
  ),
  branchGenerate: createTask(
    "task-branch-generate",
    "branch_deeper",
    "node-3",
    "generating",
    true,
    "confirmed",
    3,
    branchReviewMessages[3].content,
    "生成节点 3 的三条下钻子方向",
    [
      createBranchTask("branch-task-1", "task-branch-generate", branchBriefs[0], "completed"),
      createBranchTask("branch-task-2", "task-branch-generate", branchBriefs[1], "completed"),
      createBranchTask("branch-task-3", "task-branch-generate", branchBriefs[2], "generating")
    ]
  ),
  refresh: createTask(
    "task-refresh",
    "refresh_layer",
    "root",
    "completed",
    false,
    "not_required",
    4,
    "保留数量，刷新第一层，让整体更轻、更易携带。",
    "刷新第一层方向，保留数量但重写方向重点",
    [
      createBranchTask("branch-task-4", "task-refresh", createBrief("brief-4", "root", "轻薄器材感", 9, "更轻薄"), "completed"),
      createBranchTask("branch-task-5", "task-refresh", createBrief("brief-5", "root", "稳握平衡感", 10, "更稳定的重心"), "completed"),
      createBranchTask("branch-task-6", "task-refresh", createBrief("brief-6", "root", "桌面转译感", 11, "更日常的桌面气质"), "completed"),
      createBranchTask("branch-task-7", "task-refresh", createBrief("brief-7", "root", "模块磁吸感", 12, "强调扩展生态"), "completed")
    ]
  )
};

const treeOperations: Record<string, TreeOperation[]> = {
  firstLayer: [],
  branchReview: [],
  deeperLayer: [
    {
      id: "op-branch-01",
      sessionId: "session-01",
      taskId: "task-branch-generate",
      type: "branch_deeper",
      targetNodeId: "node-3",
      targetLayerVersion: 1,
      supersededNodeIds: [],
      restoredNodeIds: ["node-6", "node-7", "node-8"],
      createdAt: iso("00:02:28")
    }
  ],
  refreshLayer: [
    {
      id: "op-refresh-01",
      sessionId: "session-01",
      taskId: "task-refresh",
      type: "refresh_layer",
      targetNodeId: "root",
      targetLayerVersion: 2,
      supersededNodeIds: ["node-2", "node-3", "node-4", "node-5"],
      restoredNodeIds: ["node-9", "node-10", "node-11", "node-12"],
      createdAt: iso("00:04:18")
    }
  ],
  undoReview: [
    {
      id: "op-branch-01",
      sessionId: "session-01",
      taskId: "task-branch-generate",
      type: "branch_deeper",
      targetNodeId: "node-3",
      targetLayerVersion: 1,
      supersededNodeIds: [],
      restoredNodeIds: ["node-6", "node-7", "node-8"],
      createdAt: iso("00:02:28")
    }
  ]
};

const createFixture = (
  id: WorkbenchScenarioId,
  label: string,
  description: string,
  session: Session,
  nodes: TreeNode[],
  messages: Message[],
  generationTasks: GenerationTask[],
  operations: TreeOperation[],
  selectedNodeId: string,
  currentTargetNodeId: string | null,
  pendingAction: PendingAction | null,
  recordingState: "idle" | "listening" | "processing",
  lastActionSummary: string | null = null
): WorkbenchFixture => ({
  id,
  label,
  description,
  serverState: {
    session,
    nodes,
    messages,
    generationTasks,
    treeOperations: operations
  },
  nodeUiMeta,
  messageDecorations,
  uiDefaults: {
    selectedNodeId,
    expandedSystemMessageIds: messages
      .filter((message) => message.role === "system" && messageDecorations[message.id]?.defaultOpen)
      .map((message) => message.id),
    recordingState,
    currentTargetNodeId,
    pendingAction,
    lastActionSummary
  }
});

export const workbenchFixtures: WorkbenchFixture[] = [
  createFixture(
    "first-layer",
    "首层方向",
    "展示首轮生成完成后的第一层 4 个方向。",
    baseSession({ activeNodeId: "node-3", updatedAt: iso("00:01:20") }),
    firstLayerNodes,
    firstLayerMessages,
    [tasks.root],
    treeOperations.firstLayer,
    "node-3",
    "root",
    null,
    "idle"
  ),
  createFixture(
    "branch-review",
    "下钻确认",
    "展示高风险操作确认卡和当前目标态。",
    baseSession({ activeNodeId: "node-3", pendingNodeId: "node-3", updatedAt: iso("00:02:14") }),
    firstLayerNodes,
    branchReviewMessages,
    [tasks.root, tasks.branchReview],
    treeOperations.branchReview,
    "node-3",
    "node-3",
    branchReviewPendingAction,
    "processing"
  ),
  createFixture(
    "deeper-layer",
    "下钻结果",
    "展示沿节点 3 下钻后的 3 个子方向，其中 1 个仍在生成中。",
    baseSession({ activeNodeId: "node-8", pendingNodeId: "node-8", updatedAt: iso("00:02:32") }),
    deeperLayerNodes,
    deeperLayerMessages,
    [tasks.root, tasks.branchGenerate],
    treeOperations.deeperLayer,
    "node-8",
    "node-8",
    null,
    "processing",
    "已确认下钻请求，当前第 3 个子方向仍在生成。"
  ),
  createFixture(
    "refresh-layer",
    "整层刷新",
    "展示保留数量、重写第一层方向后的刷新结果。",
    baseSession({ activeNodeId: "node-10", updatedAt: iso("00:04:18") }),
    refreshedLayerNodes,
    refreshMessages,
    [tasks.root, tasks.branchGenerate, tasks.refresh],
    treeOperations.refreshLayer,
    "node-10",
    "root",
    null,
    "idle",
    "第一层已按“更轻、更易携带”的要求整层刷新。"
  ),
  createFixture(
    "undo-review",
    "单次撤销",
    "展示最近一次树操作的撤销确认流程。",
    baseSession({ activeNodeId: "node-8", pendingNodeId: "node-3", updatedAt: iso("00:05:18") }),
    deeperLayerNodes.map((node) => ({
      ...node,
      status: node.id === "node-8" ? "ready" : node.status
    })),
    undoMessages,
    [tasks.root, createTask(
      "task-branch-finished",
      "branch_deeper",
      "node-3",
      "completed",
      true,
      "confirmed",
      3,
      branchReviewMessages[3].content,
      "完成节点 3 的三条下钻方向",
      [
        createBranchTask("branch-task-1b", "task-branch-finished", branchBriefs[0], "completed"),
        createBranchTask("branch-task-2b", "task-branch-finished", branchBriefs[1], "completed"),
        createBranchTask("branch-task-3b", "task-branch-finished", branchBriefs[2], "completed")
      ]
    )],
    treeOperations.undoReview,
    "node-8",
    "node-3",
    undoPendingAction,
    "idle",
    "最近一次树操作可撤销。"
  )
];

export const workbenchFixtureMap = Object.fromEntries(
  workbenchFixtures.map((fixture) => [fixture.id, fixture])
) as Record<WorkbenchScenarioId, WorkbenchFixture>;
