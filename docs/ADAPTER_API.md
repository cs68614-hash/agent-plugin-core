# Adapter API

Adapter 模块必须导出：

```js
export function createApplicationAdapter({ config, pluginRoot })
```

并返回以下方法。

## getCapabilities

```js
await adapter.getCapabilities()
```

返回应用标识、功能特征和动作定义。不要在这里返回密钥或用户隐私数据。

## getState

```js
await adapter.getState({ projectDir })
```

返回：

```json
{
  "projectDir": "/workspace",
  "state": {
    "version": 12
  },
  "storage": {}
}
```

`state.version` 必须能用于检测陈旧写入。云端可以映射数据库 revision、ETag、sequence number 或聚合版本。

## executeAction

```js
await adapter.executeAction({
  projectDir,
  action,
  input,
  dryRun,
  expectedVersion
})
```

要求：

- 校验权限和租户；
- 校验 `expectedVersion`；
- `dryRun` 不得产生持久外部副作用；
- 返回稳定对象 ID；
- 返回 `beforeVersion`、`afterVersion` 和 mutation/audit ID；
- 对外部异步任务返回 job ID 和可查询状态。

## applyOperations

```js
await adapter.applyOperations({
  projectDir,
  operations: [{ action, input }],
  dryRun,
  expectedVersion
})
```

优先使用数据库事务。无法事务化的跨系统工作流应：

1. 先验证所有输入；
2. 建立 workflow/job 记录；
3. 为每步设计 idempotency key；
4. 保存完成进度；
5. 对失败步骤执行补偿或进入人工处理；
6. 不把部分成功伪装成原子成功。

## getEvents

```js
await adapter.getEvents({ projectDir, sinceVersion, limit })
```

事件至少包含：

```json
{
  "mutationId": "...",
  "action": "update_order",
  "beforeVersion": 10,
  "afterVersion": 11,
  "timestamp": "..."
}
```

生产环境还应记录 actor、tenant、request ID、审批信息和结果状态，但避免记录秘密字段。

## 错误契约

建议使用稳定错误码：

```text
UNAUTHENTICATED
FORBIDDEN
NOT_FOUND
VALIDATION_ERROR
VERSION_CONFLICT
CONFIRMATION_REQUIRED
RATE_LIMITED
DEPENDENCY_UNAVAILABLE
PARTIAL_FAILURE
```

错误消息应告诉 Agent 如何恢复，而不是只返回内部堆栈。
