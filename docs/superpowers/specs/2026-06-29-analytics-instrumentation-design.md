# 埋点方案设计

## 目标

为当前 PMF 探索阶段的 voice painting workbench 定义一套轻量埋点方案。

这套方案优先回答两个问题：

- 用户有没有走到第一个真实价值时刻
- 用户在走到这个时刻之前，主要卡在哪一步

这不是一套偏增长团队风格的重型分析体系，而是一套为了更快学习、更低实现成本、更适合当前阶段的最小埋点方案。

## 产品阶段假设

- 当前版本是邀请码或 beta code 控制下的小范围探索产品
- 用户可能需要自行提供 SiliconFlow API Key
- 团队当前希望先验证 PMF，再决定是否投入完整登录、计费或正式增长体系
- 当前最重要的价值时刻不是长期留存，而是用户能不能从一个模糊想法出发，顺利看到第一批设计方向

## 北极星事件

### 核心事件

`first_value_reached`

### 事件定义

只有同时满足以下 3 个条件时，才触发这个事件：

1. 用户已经提交了第一条需求或 prompt
2. 第一次生成请求已经成功完成
3. 前端已经把第一批结果真实渲染出来，用户能够看到

这个事件必须由前端确认。仅仅后端返回成功，不算达到价值时刻。

### 为什么这样定义

- 它对应的是真实用户体验，而不是系统内部执行状态
- 它是产品“已经交付价值”的最早可信信号
- 即使后续底层生成链路调整，这个口径仍然稳定

## 埋点原则

- 优先埋“业务事件”，不要优先埋“按钮点击”
- 优先小而准的高信号事件，不追求一开始全覆盖
- 把主漏斗事件和诊断失败事件分开
- 不上传密钥和不必要的敏感内容
- 第一版实现范围要足够小，确保能尽快上线并开始学习

## 主漏斗设计

当前阶段建议关注这条主漏斗：

`landing_view -> beta_code_verified -> api_key_validated -> first_prompt_submitted -> first_generation_succeeded -> first_result_rendered -> first_value_reached`

这条漏斗主要回答：

- 有多少访问者走到了产品门槛前
- 有多少用户通过了门槛
- 有多少用户完成了 API Key 配置
- 有多少用户真正开始了有效使用
- 有多少用户成功拿到并看见了第一批结果

## 事件分层

### 1. 主漏斗事件

这些事件定义了用户从进入产品到达到首个价值时刻的主路径。

| 事件名 | 触发时机 | 说明 |
| --- | --- | --- |
| `landing_view` | 用户打开落地页 | 顶层访问事件 |
| `beta_gate_view` | 用户看到邀请码或 beta code 门槛页 | 只有存在门槛时才触发 |
| `beta_code_submitted` | 用户提交 beta code | 提交尝试即触发 |
| `beta_code_verified` | beta code 校验通过 | 仅成功时触发 |
| `api_key_dialog_view` | API Key 输入界面被展示 | 可以是弹窗、面板或内嵌表单 |
| `api_key_submitted` | 用户提交 API Key | 提交尝试即触发 |
| `api_key_validated` | API Key 验证通过 | 仅成功时触发 |
| `session_created` | 为用户成功创建 workbench session | 使用后端返回的 session id |
| `first_prompt_submitted` | 用户提交第一条需求 | 可以来自文字输入，也可以来自语音转写后的文本 |
| `first_generation_started` | 第一轮生成请求开始 | 从这里开始计时 |
| `first_generation_succeeded` | 第一轮生成请求返回可用结果 | 这里以后端成功为准 |
| `first_result_rendered` | 第一批结果卡片或节点已经在 workbench 中渲染出来 | 由前端确认渲染成功 |
| `first_value_reached` | 用户已经可以看到第一批结果 | 北极星事件 |

### 2. 诊断失败事件

这些事件用于解释主漏斗中的主要流失点。

| 事件名 | 触发时机 | 说明 |
| --- | --- | --- |
| `beta_code_failed` | beta code 校验失败 | 需要带标准化失败原因 |
| `api_key_validation_failed` | API Key 被拒绝或验证流程失败 | 绝不记录 key 本身 |
| `first_generation_failed` | 第一轮生成请求失败 | 需要带阶段和错误码 |
| `result_render_failed` | 前端无法渲染第一批结果 | 用来识别后端成功但前端未交付的情况 |
| `voice_recording_failed` | 语音录制在提交前失败 | 适用于语音是主输入路径时 |

### 3. 深度使用与反馈事件

这些事件帮助判断用户达到价值后，是否愿意继续深入使用，以及他们主观上是否觉得有帮助。

| 事件名 | 触发时机 | 说明 |
| --- | --- | --- |
| `followup_submitted` | 用户在第一批结果之后提交了追问或继续发散请求 | 早期深度使用信号 |
| `node_selected` | 用户在结果出现后选择了某个节点 | 可选，如果节点导航是核心体验则建议保留 |
| `branch_expanded` | 用户沿某个分支继续发散 | 可选，但通常很有价值 |
| `export_clicked` | 用户点击导出 | 如果存在导出，这是较强意图信号 |
| `feedback_impression` | 轻反馈组件被展示 | 只在首个价值时刻之后展示 |
| `feedback_selected` | 用户选择了一个反馈选项 | 主要 PMF 质量信号 |
| `feedback_text_opened` | 用户展开了可选文字反馈 | 可选 |
| `feedback_text_submitted` | 用户提交了文字反馈 | 可选 |

## 反馈设计

### 触发时机

第一轮反馈只在 `first_value_reached` 之后出现。

推荐时机：

- 第一批结果出现后延迟 3 到 8 秒展示，或
- 用户点击过某个结果卡片或某个分支后再展示

不要在生成完成的第一瞬间用阻断式弹窗打断用户。

### 反馈问题

`这第一批方向对你有帮助吗？`

### 反馈选项

- `helpful`
- `neutral`
- `unhelpful`

第一步反馈必须是一键完成，文字反馈必须保持可选，不要强制填写。

### 对负面或中性反馈的轻追问

如果用户选择 `neutral` 或 `unhelpful`，可以再展示一个很轻的追问：

`主要问题是什么？`

建议标签：

- `did_not_understand_need`
- `result_quality_low`
- `too_few_directions`
- `next_step_unclear`

这一步的价值很高，因为它能帮助区分问题到底出在模型质量、交互流程，还是 onboarding 和价值表达上。

## 事件属性

每个事件先带一组较小的通用属性，后续只有在分析真的需要时再扩展。

### 建议的通用属性

| 属性名 | 类型 | 说明 |
| --- | --- | --- |
| `distinct_id` | string | 匿名本地用户 id 或登录后的用户 id |
| `session_id` | string nullable | 创建 workbench session 后开始存在 |
| `beta_batch` | string nullable | 所属邀请码批次或测试 cohort |
| `input_mode` | enum | `text` 或 `voice` |
| `target_node_depth` | number nullable | 第一批结果之后开始更有意义 |
| `duration_ms` | number nullable | 用于校验、生成等关键链路耗时 |
| `success` | boolean nullable | 适合部分诊断事件 |
| `error_code` | string nullable | 只保留标准化错误码 |

### 建议的事件特有属性

`api_key_validated`

- `validation_method`
- `duration_ms`

`first_prompt_submitted`

- `input_mode`
- `prompt_length_bucket`
- `has_api_key`

`first_generation_succeeded`

- `duration_ms`
- `result_count`
- `target_node_depth`

`first_result_rendered`

- `duration_ms`
- `result_count`
- `render_surface`

`first_value_reached`

- `time_to_value_ms`
- `result_count`
- `input_mode`
- `beta_batch`

`feedback_selected`

- `selected_feedback`
- `time_to_value_ms`
- `result_count`
- `input_mode`
- `has_followup_before_feedback`

`feedback_text_submitted`

- `text_length`
- `feedback_tag`

## 隐私与数据边界

第一版埋点必须明确什么不能收，避免后续把探索方案做成高风险方案。

### 明确不采集

- 原始 API Key
- 完整认证 token
- 完整音频内容通过埋点系统上传
- 含敏感签名参数的完整图片 URL
- 默认情况下的完整自由文本 prompt

### 优先采集这些替代信息

- 例如 `has_api_key` 这样的布尔值
- 例如 `prompt_length_bucket` 这样的区间信息
- 标准化错误码
- 结果数量、耗时、步骤完成状态
- 简短结构化反馈标签

### 关于 prompt 内容的建议

在 PMF 探索阶段，默认不要把完整 prompt 文本送进埋点系统。

如果后续确实需要内容洞察，优先考虑这几种方式：

- 从用户主动提交的文字反馈中做人工定性分析
- 在产品逻辑中生成结构化 prompt 标签
- 使用脱敏或归类后的摘要，而不是原始文本

## 身份策略

当前阶段不要因为还没有完整账号系统，就阻塞埋点上线。

推荐的身份策略：

- 浏览器第一次访问时生成一个本地 `distinct_id`
- 同一设备重复使用这个 id
- 创建 workbench session 后，把 `session_id` 一并附加到后续事件
- 如果未来登录成为强制项，再把匿名 id 与登录后 id 做 merge 或 alias

这样可以兼容当前偏轻的产品方案，不必先做完整 auth 再开始埋点。

## 前后端职责边界

### 前端负责

- 页面曝光事件
- 用户动作事件
- `first_result_rendered` 的确认
- `first_value_reached` 的确认
- 轻反馈组件的触发与反馈事件上报

### 后端负责

- 返回稳定的 session id 和标准化错误码
- 视需要输出运维或调试日志
- 不要把后端日志当作 PMF 埋点的唯一事实来源

对于“价值有没有真正交付给用户”这件事，前端应该是唯一可信的来源。

## 第一版最小上线范围

第一版建议只上线以下事件：

1. `landing_view`
2. `beta_gate_view`
3. `beta_code_submitted`
4. `beta_code_verified`
5. `api_key_dialog_view`
6. `api_key_submitted`
7. `api_key_validated`
8. `session_created`
9. `first_prompt_submitted`
10. `first_generation_started`
11. `first_generation_succeeded`
12. `first_result_rendered`
13. `first_value_reached`
14. `feedback_impression`
15. `feedback_selected`

诊断失败事件和深度使用事件可以等这一批核心埋点稳定后再补。

## 这套方案应该回答的问题

埋点上线后，团队至少应该能回答这些问题：

- 落地页访问者里，有多少人通过了产品门槛
- 通过门槛的用户里，有多少人完成了 API Key 配置
- 完成配置的用户里，有多少人提交了第一条真实需求
- 第一条需求里，有多少最终变成了前端可见的第一批结果
- 用户到达第一个价值时刻平均需要多久
- 用户是否主观上觉得第一批结果有帮助
- 负面反馈主要来自结果质量、需求理解，还是下一步引导不清楚

## 后续扩展方向

只有当第一阶段已经稳定产出信号后，才建议扩展埋点面。

后续可能增加：

- 按邀请码来源或测试批次对比 cohort
- D1 或 D7 revisit 之类的轻留存信号
- 从 `export_clicked` 升级到更完整的导出完成事件
- 分支层级的质量指标
- 第一批结果之后更细的继续使用行为

## 推荐结论

这份方案应该被当作一层“PMF 验证埋点”，而不是一套永久性的全量事件命名体系。

当前真正要尽快回答的是：

- 用户能不能走到第一个有意义的结果
- 他们会不会觉得这个结果有帮助
- 如果走不到，主要是卡在产品的哪一段

如果这些问题还没有回答清楚，优先优化产品流程，而不是继续扩埋点。
