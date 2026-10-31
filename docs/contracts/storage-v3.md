# 打卡存储契约 v3

实现：`apps/web/src/utils/checkin.ts`。任何结构或语义变更必须先改本契约，再改实现和测试。

## 存储键与顶层结构

当前键：`junheng-checkin-v3`，值为 JSON 对象。

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `schema` | `3` | 固定版本号。 |
| `userCode` | string | 匿名营员代码，格式见下文。 |
| `startDate` | string | 21 天窗口第 1 天，`YYYY-MM-DD`。 |
| `records` | object | 以真实日期键索引 `DayRecord`；空记录可不保存。 |

示例：

```json
{
  "schema": 3,
  "userCode": "JH-AB2CD",
  "startDate": "2026-10-01",
  "records": {
    "2026-10-01": {
      "weight": "60.2",
      "waist": "72",
      "meals": [true, true, false],
      "water": true,
      "movement": false,
      "sleep": true
    }
  }
}
```

## 日期与每日记录

- 日期键使用浏览器本地日历日期，格式 `YYYY-MM-DD`；不得改用 UTC 时间戳或带时间的 ISO 字符串。
- 21 天窗口为 `startDate` 起连续 21 个日期键。
- `DayRecord` 字段：`weight: string`、`waist: string`、`meals: boolean[3]`、`water: boolean`、`movement: boolean`、`sleep: boolean`；多节点扩展字段 `weights`、`clothes` 为可选（见下节）。
- `meals` 顺序固定为早餐、午餐、晚餐；长度必须为 3。
- 体重或腰围非空，或任一行为项为 `true`，即视为有内容；`weights` 任一节点有有效值同样视为有内容。CSV 只导出有内容记录。

## 体重多节点扩展（v3 增量，schema 仍为 3）

`DayRecord` 新增可选字段，原始称重值全部保留：

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `weights` | object，可选 | 原始称重值（未扣衣物），键为 `morning` / `noon` / `evening`，值为 string kg。 |
| `clothes` | string，可选 | 当天录入时的衣物重量快照（kg）；缺省视为 `"0"`。 |

顶层 `CheckInState` 新增 `clothesWeight: string`（可选）：全局默认衣物重量，默认 `"0"`。修改全局值只影响之后新录入的记录；已保存当天的 `clothes` 快照不变。

派生与兼容规则：

1. **唯一真相是 `weights` 原始值**；净重 = 称重 − 衣物，在使用时现算，不存净重。净重 < 20 kg 视为录入异常，不参与代表体重计算并由 UI 警告。
2. `weight` 字段保留，保存时双写为「综合代表体重」缓存，仅供旧读者（趋势、CSV、海报）使用；`weights` 存在时以 `weights` 为准，忽略 `weight` 缓存。
3. 旧数据只有 `weight` 时，读取视为 `morning = weight`、`clothes = "0"`；只读不静默重写，用户编辑保存时才升级为 `weights` 结构。
4. `weights` 损坏或不是对象时回退到 `weight`；仍无效则视为无体重记录。
5. 综合代表体重算法：早/中/晚基础权重 60% / 20% / 20%，缺失节点按剩余权重等比重归一化；仅一个节点时取其净重；仅中/晚无早晨时标注「非空腹参考值」。不设固定时段补偿偏移量。
6. 实现：`apps/web/src/utils/weight.ts` 纯函数；前台趋势、海报、CSV、后台统计必须统一调用 `getRepresentativeWeight`，不得各自实现。

## v2 / v1 迁移

旧键：

- v2：`junheng-checkin-v2`
- v1：`junheng-seven-day-checkin-v1`

规则：

1. 无有效 v3 时才迁移；同时存在旧键时优先读取 v2。
2. 旧值必须是长度为 7 或 21 的数组，否则迁移失败并创建全新 v3。
3. 数组表示截止今天的连续 N 天：`startDate = today - (N - 1)`，数组下标 `i` 映射到 `startDate + i`，最后一项映射到今天；不得从今天向未来排列。
4. 每日记录按 v3 默认值归一化，空记录不写入 `records`。
5. 迁移生成新的匿名 `userCode`，写入 v3 后返回；旧键不由读取逻辑删除。
6. 存储不可用、JSON 损坏或 v3 字段无效时回退到全新 v3，并立即尝试持久化。

## 营员代码

- 格式：`JH-XXXXX`，共 5 个随机字符。
- 字符表：`ABCDEFGHJKMNPQRSTUVWXYZ23456789`。
- **终身唯一**：仅在无有效 v3 的首次创建或旧版迁移时生成；已存在 `userCode` 时任何读取、编辑、同步路径不得重新生成或覆盖，UI 不提供再生成入口。云端已有 `checkin_sync` 行时以云端 `user_code` 为准，同步仅更新 `start_date` / `records` / `updated_at`，本地不一致时对齐云端。
- 新代码优先使用 `crypto.getRandomValues`；不可用时回退到 `Math.random`。
- 代码仅用于本机记录、海报和 CSV 汇总，不代表登录身份；云端备份时作为 `checkin_sync.user_code` 业务字段随行，仍不是认证凭证。
- 海报署名另存于 `junheng-checkin-name-v1`，不属于 v3 顶层结构。

## 云端同步（v1.9.0 新增，不改本机契约）

本机 v3 仍是唯一权威存储。绑定邮箱后，前端把 v3 的 `records` 按 `user_code`、`start_date` 快照覆盖式备份到 Supabase `checkin_sync` 表（迁移见 `services/supabase/migrations/`）：

| v3 字段 | `checkin_sync` 列 | 说明 |
| --- | --- | --- |
| `userCode` | `user_code` | 业务码随行，非身份。 |
| `startDate` | `start_date` | `date`，与 v3 日期键同源。 |
| `records` | `records` | `jsonb`，键仍为 `YYYY-MM-DD` 本地日期键，结构与 `DayRecord` 一致。 |

规则：

1. 种子期同步为**云端覆盖本地/本地覆盖云端**的单向快照，不做逐日合并；本地留存始终保留。
2. 服务端认证身份（Supabase uid）与本机 `userCode` 是两套标识；未来服务端营员身份另立 `identity-v1` 契约，不得把 `userCode` 当登录账号。
3. 服务端时间戳使用 UTC ISO 8601，与本机 `YYYY-MM-DD` 日期键不冲突；未来服务端打卡必须另立契约，不得修改本 v3。
4. RLS：营员只能读写自己 uid 的行；管理员经 `camp_admins` 白名单获得只读权限，走 `admin_checkin_overview()` RPC。

## CSV 导出

文件为 UTF-8 with BOM、逗号分隔、LF 换行，末尾保留换行。记录按 `record_date` 升序，只包含有内容日期。

| 顺序 | 列名 | 定义 |
| --- | --- | --- |
| 1 | `user_code` | 当前 `userCode`。 |
| 2 | `record_date` | 真实日期键，`YYYY-MM-DD`。 |
| 3 | `day_index` | 相对当前 `startDate` 的第几天；1–21，窗口外为空。 |
| 4 | `weight_kg` | `weight` 原始字符串，单位 kg。 |
| 5 | `waist_cm` | `waist` 原始字符串，单位 cm。 |
| 6 | `meal_breakfast` | 早餐，是 `1`，否 `0`。 |
| 7 | `meal_lunch` | 午餐，是 `1`，否 `0`。 |
| 8 | `meal_dinner` | 晚餐，是 `1`，否 `0`。 |
| 9 | `water` | 饮水打卡，是 `1`，否 `0`。 |
| 10 | `movement` | 运动打卡，是 `1`，否 `0`。 |
| 11 | `sleep` | 睡眠打卡，是 `1`，否 `0`。 |

修改键、字段、日期语义、迁移顺序或 CSV 列时，必须同步增加兼容测试与迁移说明。
