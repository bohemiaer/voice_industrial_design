import { z } from "zod";

import {
  BRAINSTORM_ACTION_TYPE,
  BRANCH_TASK_STATUS,
  CONFIRMATION_STATUS,
  MESSAGE_KIND,
  MESSAGE_ROLE,
  NODE_REFERENCE_STRATEGY,
  TASK_STATUS,
  TREE_NODE_STATUS,
  TREE_OPERATION_TYPE
} from "./constants";

export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const TaskStatusSchema = z.enum(TASK_STATUS);
export const BranchTaskStatusSchema = z.enum(BRANCH_TASK_STATUS);
export const TreeNodeStatusSchema = z.enum(TREE_NODE_STATUS);
export const MessageRoleSchema = z.enum(MESSAGE_ROLE);
export const MessageKindSchema = z.enum(MESSAGE_KIND);
export const ConfirmationStatusSchema = z.enum(CONFIRMATION_STATUS);
export const BrainstormActionTypeSchema = z.enum(BRAINSTORM_ACTION_TYPE);
export const TreeOperationTypeSchema = z.enum(TREE_OPERATION_TYPE);
export const NodeReferenceStrategySchema = z.enum(NODE_REFERENCE_STRATEGY);

export const ProductDomainSchema = z.literal("industrial_design");
export const SketchStageSchema = z.enum(["early", "mid"]);
export const InputModeSchema = z.literal("voice_only");
export const SessionStyleSketchToneSchema = z.enum(["loose", "controlled"]);
export const DepthContextBranchStageSchema = z.enum([
  "first_layer",
  "deeper_layer"
]);

export const VoiceNamingSchema = z.object({
  displayName: z.string().min(1).max(32),
  publicNodeNumber: z.number().int().positive(),
  layerOrdinal: z.number().int().positive(),
  voiceAliases: z.array(z.string().min(1)).min(1)
});

export const TreeNodeSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  parentNodeId: z.string().min(1).nullable(),
  depth: z.number().int().nonnegative(),
  displayName: z.string().min(1).max(32),
  label: z.string().min(1),
  publicNodeNumber: z.number().int().positive(),
  layerOrdinal: z.number().int().positive(),
  layerVersion: z.number().int().positive(),
  voiceAliases: z.array(z.string().min(1)).min(1),
  intentSummary: z.string().min(1),
  formLanguage: z.array(z.string().min(1)),
  userNeedResponse: z.array(z.string().min(1)),
  inspirationHints: z.array(z.string().min(1)),
  imageUrl: z.string().url().nullable(),
  status: TreeNodeStatusSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema
});

export const SessionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  goal: z.string().min(1),
  productDomain: ProductDomainSchema,
  activeNodeId: z.string().min(1).nullable(),
  pendingNodeId: z.string().min(1).nullable(),
  lastMentionedNodeId: z.string().min(1).nullable(),
  nextPublicNodeNumber: z.number().int().positive(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema
});

export const MessageSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  taskId: z.string().min(1).nullable(),
  role: MessageRoleSchema,
  kind: MessageKindSchema,
  content: z.string().min(1),
  createdAt: IsoDateTimeSchema
});

export const VisualDirectionBriefSchema = z.object({
  briefId: z.string().min(1),
  targetParentNodeId: z.string().min(1),
  publicNodeNumber: z.number().int().positive().optional(),
  label: z.string().min(1),
  displayName: z.string().min(1).max(32),
  intentSummary: z.string().min(1),
  formLanguage: z.array(z.string().min(1)).min(1),
  userNeedResponse: z.array(z.string().min(1)).min(1),
  inspirationHints: z.array(z.string().min(1)).min(1),
  variationAxis: z.string().min(1),
  promptIntent: z.string().min(1)
});

export const BrainstormAssistantInputSchema = z.object({
  sessionGoal: z.string().min(1),
  transcriptText: z.string().min(1),
  selectedNodeId: z.string().min(1),
  selectedNodeSummary: z.object({
    publicNodeNumber: z.number().int().positive(),
    displayName: z.string().min(1).max(32),
    label: z.string().min(1),
    intentSummary: z.string().min(1),
    formLanguage: z.array(z.string().min(1)),
    userNeedResponse: z.array(z.string().min(1)),
    inspirationHints: z.array(z.string().min(1))
  }),
  ancestorPath: z.array(
    z.object({
      nodeId: z.string().min(1),
      label: z.string().min(1),
      intentSummary: z.string().min(1)
    })
  ),
  siblingSummaries: z.array(
    z.object({
      nodeId: z.string().min(1),
      label: z.string().min(1),
      intentSummary: z.string().min(1),
      formLanguage: z.array(z.string().min(1))
    })
  ),
  constraints: z.object({
    minBranchCount: z.number().int().positive(),
    maxBranchCount: z.number().int().positive(),
    productDomain: ProductDomainSchema,
    sketchStage: SketchStageSchema,
    inputMode: InputModeSchema
  })
});

export const BrainstormAssistantOutputSchema = z
  .object({
    actionType: BrainstormActionTypeSchema,
    targetNodeId: z.string().min(1),
    branchCount: z.number().int().positive(),
    designIntentSummary: z.string().min(1),
    assistantReply: z.string().min(1),
    confirmationRequired: z.boolean(),
    rewrittenIntentForConfirmation: z.string().min(1).optional(),
    promptHints: z.array(z.string().min(1)),
    directionBriefs: z.array(VisualDirectionBriefSchema)
  })
  .superRefine((value, ctx) => {
    if (value.directionBriefs.length !== value.branchCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "directionBriefs length must equal branchCount",
        path: ["directionBriefs"]
      });
    }

    if (value.confirmationRequired && !value.rewrittenIntentForConfirmation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "rewrittenIntentForConfirmation is required when confirmationRequired is true",
        path: ["rewrittenIntentForConfirmation"]
      });
    }
  });

export const SketchGenerationInputSchema = z.object({
  brief: VisualDirectionBriefSchema,
  sessionStyle: z.object({
    sketchTone: SessionStyleSketchToneSchema,
    detailLevel: SketchStageSchema,
    productDomain: ProductDomainSchema
  }),
  depthContext: z.object({
    depth: z.number().int().nonnegative(),
    branchStage: DepthContextBranchStageSchema
  }),
  siblingContext: z
    .array(
      z.object({
        briefId: z.string().min(1),
        label: z.string().min(1),
        variationAxis: z.string().min(1),
        formLanguage: z.array(z.string().min(1))
      })
    )
    .optional()
});

export const SketchGenerationOutputSchema = z.object({
  imageId: z.string().min(1),
  briefId: z.string().min(1),
  imageUrl: z.string().url(),
  promptUsed: z.string().min(1),
  negativePromptUsed: z.string().min(1).optional(),
  visualSummary: z.string().min(1)
});

export const BranchTaskSchema = z.object({
  id: z.string().min(1),
  generationTaskId: z.string().min(1),
  brief: VisualDirectionBriefSchema,
  status: BranchTaskStatusSchema,
  imageUrl: z.string().url().nullable(),
  errorMessage: z.string().min(1).nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema
});

export const GenerationTaskSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  actionType: BrainstormActionTypeSchema,
  targetNodeId: z.string().min(1),
  status: TaskStatusSchema,
  confirmationRequired: z.boolean(),
  confirmationStatus: ConfirmationStatusSchema,
  rewrittenIntentForConfirmation: z.string().min(1).nullable(),
  branchCount: z.number().int().positive(),
  transcriptText: z.string().min(1),
  designIntentSummary: z.string().min(1),
  branchTasks: z.array(BranchTaskSchema).default([]),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema
});

export const TreeOperationSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  taskId: z.string().min(1).nullable(),
  type: TreeOperationTypeSchema,
  targetNodeId: z.string().min(1),
  targetLayerVersion: z.number().int().positive().nullable(),
  supersededNodeIds: z.array(z.string().min(1)),
  restoredNodeIds: z.array(z.string().min(1)),
  createdAt: IsoDateTimeSchema
});

export const NodeReferenceCandidateSchema = z.object({
  strategy: NodeReferenceStrategySchema,
  rawText: z.string().min(1),
  targetNodeId: z.string().min(1).nullable(),
  confidence: z.number().min(0).max(1)
});

export type Session = z.infer<typeof SessionSchema>;
export type Message = z.infer<typeof MessageSchema>;
export type TreeNode = z.infer<typeof TreeNodeSchema>;
export type VisualDirectionBrief = z.infer<typeof VisualDirectionBriefSchema>;
export type BrainstormAssistantInput = z.infer<
  typeof BrainstormAssistantInputSchema
>;
export type BrainstormAssistantOutput = z.infer<
  typeof BrainstormAssistantOutputSchema
>;
export type SketchGenerationInput = z.infer<typeof SketchGenerationInputSchema>;
export type SketchGenerationOutput = z.infer<
  typeof SketchGenerationOutputSchema
>;
export type BranchTask = z.infer<typeof BranchTaskSchema>;
export type GenerationTask = z.infer<typeof GenerationTaskSchema>;
export type TreeOperation = z.infer<typeof TreeOperationSchema>;
export type NodeReferenceCandidate = z.infer<
  typeof NodeReferenceCandidateSchema
>;
