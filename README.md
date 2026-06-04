# 单电池仪器预约平台

这是一个基于 Next.js + Supabase 的在线预约平台模板，可部署到 Vercel。

## 功能

- 首页显示未来预约
- 按日期查看当天时间段
- 按小时选择开始/结束时间
- 防止同一日期同一时间段重复预约
- 数据保存在 Supabase PostgreSQL 数据库中

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

## 必需环境变量

```bash
SUPABASE_URL=你的 Supabase Project URL
SUPABASE_SECRET_KEY=你的 Supabase Secret key 或 legacy service_role key
```

## 数据库初始化

进入 Supabase Dashboard → SQL Editor，运行 `db/schema.sql` 中的 SQL。
