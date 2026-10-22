# 验收证据归档目录

本目录存放真实平台逐账号验收的书面批准单与证据，流程见
[`../real-platform-acceptance-runbook.md`](../real-platform-acceptance-runbook.md)。

## 目录结构

- `APPROVAL-TEMPLATE.md` — 批准单模板；复制为 `APPROVAL-<日期>-<批准人>.md`，填写后存档。
- `<日期>-<平台>-<能力>/` — 每次验收一个目录，内容：外部 ID、时间、截图、日志片段。

## 规则

1. 批准单是执行验收的唯一凭据；没有批准单不得向真实平台发送。
2. 截图与日志中不得包含明文密钥、Cookie、完整手机号。
3. 验收结论（通过/失败）写回 `../real-platform-acceptance-runbook.md` 第 5 节状态表，
   通过时同步更新能力矩阵与 `../crm-release-status.md`。
4. 执行前可运行 `pnpm acceptance:readiness` 做只读就绪检查。
