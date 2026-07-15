# Tool Design

## 一项业务动作对应一个 Tool

推荐：

```text
list_orders
create_order
approve_order
cancel_order
export_orders
```

不推荐：

```text
click
type
navigate
run_javascript
execute_anything
```

专用 Tool 让 Agent 得到更清晰的描述、Schema 和安全 annotations。`execute_app_action` 仅用于兼容动态 UI 或旧客户端。

## 输入 Schema

- 所有 ID 都写清对象类型；
- 枚举用 `enum`；
- 字符串给出长度限制；
- 金额不要使用模糊浮点数，优先整数最小货币单位；
- 时间使用带时区 ISO 8601；
- 禁止未声明字段时设置 `additionalProperties: false`；
- 修改操作支持 `expectedVersion` 或资源 ETag。

## 返回值

推荐：

```json
{
  "ok": true,
  "mutationId": "mutation-123",
  "beforeVersion": 41,
  "afterVersion": 42,
  "order": {
    "id": "order-8",
    "status": "approved"
  }
}
```

避免只返回：

```text
Done.
```

## 安全 annotations

- 查询工具：`readOnlyHint: true`
- 删除、发布、付款、外发：`destructiveHint: true`
- 相同输入重复执行安全：`idempotentHint: true`
- 会访问公网或第三方：`openWorldHint: true`

annotations 只帮助 Agent 决策，不替代服务端授权和确认 token。

## 批处理

使用 `apply_app_operations` 处理有依赖的多步状态修改。dry-run 返回完整 preview；提交时携带同一 `expectedVersion`。外部系统无法原子事务时，应返回 workflow/job 状态，而不是声称原子完成。
