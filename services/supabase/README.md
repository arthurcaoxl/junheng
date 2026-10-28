# Supabase（预留）

当前网站为纯静态站点，打卡数据仅存浏览器 `localStorage`，未连接 Supabase。

后续接入顺序：

1. 先更新 `docs/contracts/storage-v3.md`，明确服务端表、匿名身份、同步冲突和隐私规则。
2. 在 `migrations/` 增加可重复执行、可审查的 SQL 迁移。
3. 本地密钥只放 `.env`；浏览器仅可使用 anon key，service role key 不得进入前端。
4. 增加迁移测试、RLS 策略测试和本地验证记录。
5. 经所有者明确批准后，才能启用 `docker-compose.yml` 中的预留服务或连接远程项目。
