# 单电池仪器预约平台

用于兰州大学化学化工学院宫琛亮课题组内部的单电池仪器在线预约与使用反馈。

## 功能

- 按日期和小时段预约仪器
- 支持跨多日预约
- 首页显示当前与未来 60 天预约
- 自动阻止时间冲突
- 预约取消功能，取消后历史记录仍保留
- 仪器使用反馈问卷
  - 使用过程中，仪器运行是否正常？
  - 背压是否已卸除？（若未加背压则选是）
  - 氢气发生器是否已关闭并放气？
  - 异常情况说明
- 若反馈中有“否”或填写异常说明，首页顶部会显示异常提醒
- 管理员可用 `ADMIN_CANCEL_CODE` 关闭异常提醒
- 历史预约查询，可显示未填写反馈、异常反馈、取消记录
- 自动删除过旧历史记录，默认保留 365 天，可通过 `HISTORY_RETENTION_DAYS` 修改

## 环境变量

在 Vercel 中设置：

```env
SUPABASE_URL=https://你的项目编号.supabase.co
SUPABASE_SECRET_KEY=你的 Supabase Secret key 或旧版 service_role key
ADMIN_CANCEL_CODE=管理员处理密码
HISTORY_RETENTION_DAYS=365
```

`ADMIN_CANCEL_CODE` 建议必须设置。它用于：

1. 管理员取消任意预约；
2. 关闭首页异常提醒。

## 数据库升级

进入 Supabase：

```text
Supabase Dashboard → SQL Editor → New query
```

复制 `db/schema.sql` 全部内容并运行。

这份 SQL 可以重复运行，不会删除已有预约记录。它会升级旧表结构，加入：

- 软取消记录
- 仪器使用反馈字段
- 异常处理字段
- 仅 active 预约防重叠约束

## 历史记录自动清理

历史记录存储在 Supabase，不占用 Vercel 文件容量。为了避免数据库无限增长，后端每次读取或提交时会轻量清理超过保留天数的记录。

默认保留：

```text
365 天
```

可在 Vercel 环境变量中修改：

```env
HISTORY_RETENTION_DAYS=180
```

不建议低于 30 天。
