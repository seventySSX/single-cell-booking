# 单电池仪器预约平台

这是一个基于 Next.js + Supabase 的在线预约平台模板，可部署到 Vercel。

## 功能

- 首页显示未来预约
- 按日期查看当天时间段
- 按小时选择开始/结束时间
- 防止同一日期同一时间段重复预约
- 新建预约时设置取消密码
- 首页预约列表支持取消预约
- 可选管理员取消密码，可取消任意预约
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

## 可选环境变量

```bash
ADMIN_CANCEL_CODE=管理员取消密码
```

设置后，管理员可以在取消预约时输入这个密码来取消任意预约。普通用户仍然可以使用自己预约时设置的取消密码取消自己的预约。

## 数据库初始化或升级

进入 Supabase Dashboard → SQL Editor，运行 `db/schema.sql` 中的 SQL。  
如果你已经创建过旧版表，也可以再次运行这份 SQL，它会自动补充 `cancel_code_hash` 字段。
