# Integration Guide

## 1. 建立能力清单

先从用户目标出发列出业务动作，不要从页面按钮出发。为每个动作记录：

- 输入；
- 输出；
- 是否只读；
- 是否破坏性；
- 是否幂等；
- 权限；
- 确认条件；
- 验证方式；
- 是否支持 dry-run；
- 失败补偿。

## 2. 配置动作

在 `config/agent-plugin.config.json` 中声明动作。配置只描述契约，实际执行仍由 Adapter 完成。

## 3. 对接后端

优先调用已有 domain service，而不是在 Adapter 中重新实现业务规则。

```js
case "create_invoice":
  return billingService.createInvoice({
    tenantId: context.tenantId,
    actorId: context.actorId,
    ...input,
  })
```

本地插件的身份上下文可来自环境变量或项目配置；远程 SaaS 应使用 OAuth/短期 token，并在服务端重新鉴权。

## 4. 对接前端

现有 Vite 应用可以继续使用自己的框架。保证最终生成一个自包含 HTML，或者在 MCP Resource CSP 中声明所有资源和连接域。

不要在 Widget 中：

- 放长期 API Key；
- 直接访问用户无权访问的内部接口；
- 将密钥写入 `window`；
- 依赖未声明的远程脚本；
- 把业务写操作藏在 UI-only API 中。

## 5. 编写 Skill

Skill 是 Agent 的操作手册。它应告诉 Agent：

- 怎样选择工具；
- 怎样读取最新状态；
- 哪些动作必须确认；
- 怎样 dry-run；
- 怎样处理冲突；
- 怎样验证成功；
- 什么情况下停止并向用户报告。

## 6. 测试矩阵

至少覆盖：

| 类型 | 必测内容 |
|---|---|
| Read | 空状态、正常状态、权限过滤 |
| Validation | 缺字段、非法枚举、未知 ID |
| Mutation | 正常提交、稳定 ID、版本递增 |
| Dry run | 有预览、无副作用 |
| Concurrency | 陈旧 expectedVersion 被拒绝 |
| Batch | 全部成功、某步失败不提交 |
| Audit | 事件数量、版本和 mutation ID |
| Widget | MCP MIME、资源加载、host bridge |
| Agent | Skill 触发、确认门、最终验证 |

## 7. 发布前

```bash
npm run quality
python3 /path/to/plugin-creator/scripts/validate_plugin.py plugins/agent-plugin-core
```

再从真实 Marketplace 安装，在新的 Codex 任务中验证至少一个完整业务工作流。
