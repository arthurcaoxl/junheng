# 打卡存储契约 v3

实现：`apps/web/src/utils/checkin.ts`。任何结构或语义变更必须先改本契约，再改实现和测试。

## 存储键与顶层结构

当前键：`junheng-checkin-v3`，值为 JSON 对象。

| 字段 | 类型 | 规则 |
| --- | --- | --- |
| `schema` | `3` | 固定版本号。 |
| `userCode` | string | 匿名体验官代码，格式见下文。 |
| `startDate` | string | 21 天窗口第 1 天，`YYYY-MM-DD`。 |
| `records` | object | 以真实日期键索引 `DayRecord`；空记录可不保存。 |
| `heightCm` | string，可选 | 用户身高，单位 cm；缺省表示未填写。 |
| `initialWeightKg` | string，可选 | 用户自定义初始体重，单位 kg；缺省时按规则自动推导。 |

示例：

```json
{
  "schema": 3,
  "userCode": "JH-AB2CD",
  "startDate": "2026-10-01",
  "heightCm": "165",
  "initialWeightKg": "68.7",
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

顶层 `CheckInState` 新增 `clothesWeight: string`（可选）：晨起衣物扣减默认值。新用户为 `"0.5"`；已有数据缺省时仍按 `"0"`，不得静默覆盖用户已有设置。确认修改后更新默认值、之后新录入记录的快照，以及今天已有多节点记录的 `clothes` 快照；历史日期快照不变。

派生与兼容规则：

1. **唯一真相是 `weights` 原始值**；仅早晨净重 = 早晨称重 − 衣物，中午和晚间输入直接视为裸重，在使用时现算，不存净重。净重 < 20 kg 视为录入异常，不参与代表体重计算并由 UI 警告。
2. `weight` 字段保留，保存时双写为「综合代表体重」缓存，仅供旧读者（趋势、CSV、海报）使用；`weights` 存在时以 `weights` 为准，忽略 `weight` 缓存。
3. 旧数据只有 `weight` 时，读取视为 `morning = weight`、`clothes = "0"`；只读不静默重写，用户编辑保存时才升级为 `weights` 结构。
4. `weights` 损坏或不是对象时回退到 `weight`；仍无效则视为无体重记录。
5. 综合代表体重算法：早/中/晚基础权重 60% / 20% / 20%，缺失节点按剩余权重等比重归一化；仅一个节点时取其净重；仅中/晚无早晨时标注「非空腹参考值」。不设固定时段补偿偏移量。
6. 实现：`apps/web/src/utils/weight.ts` 纯函数；前台趋势、海报、CSV、后台统计必须统一调用 `getRepresentativeWeight`，不得各自实现。

## 基础档案与 BMI 扩展（v3 增量，schema 仍为 3）

顶层 `CheckInState` 新增两个可选字符串字段，旧快照缺省时保持 `undefined`，不生成默认值，不升级为 v4：

| 字段 | 规则 |
| --- | --- |
| `heightCm` | 用户主动填写的身高（cm）。BMI 的初始值、当前值与趋势均按当前身高实时重算，不保存历史 BMI 快照。 |
| `initialWeightKg` | 用户自定义初始体重（kg）。缺省时优先取当前窗口 D1 的有效体重，D1 无体重则取窗口内最早有效体重；每日体重统一通过 `getRepresentativeWeight` 读取。 |

规则：

1. 当前体重取当前 21 天窗口内日期最晚的有效体重；变化量为当前原始 BMI 减初始原始 BMI，展示保留 1 位小数并归一 `-0`。
2. BMI 分类使用未四舍五入的原始值：`< 18.5` 为体重过低，`18.5–<24.0` 为正常，`24.0–<28.0` 为超重，`>=28.0` 为肥胖；标准来源为《成人体重判定》（WS/T 428—2013）。
3. 身高与自定义初始体重属于用户档案，不属于 `records`，不得使用特殊日期键或伪记录保存。
4. 本地解析、严格快照校验与云端恢复必须保留这两个可选字段，缺省字段不得影响既有记录读取。

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

## 体验官代码

- 格式：`JH-XXXXX`，共 5 个随机字符。
- 字符表：`ABCDEFGHJKMNPQRSTUVWXYZ23456789`。
- **终身唯一**：仅在无有效 v3 的首次创建或旧版迁移时生成；已存在 `userCode` 时任何读取、编辑、同步路径不得重新生成或覆盖，UI 不提供再生成入口。云端已有 `checkin_sync` 行时以云端 `user_code` 为准，同步仅更新 `start_date` / `records` / `height_cm` / `initial_weight_kg` / `updated_at`，本地不一致时对齐云端。
- 新代码优先使用 `crypto.getRandomValues`；不可用时回退到 `Math.random`。
- 代码仅用于本机记录、海报和 CSV 汇总，不代表登录身份；云端备份时作为 `checkin_sync.user_code` 业务字段随行，仍不是认证凭证。
- 海报署名另存于 `junheng-checkin-name-v1`，不属于 v3 顶层结构。

## 云端同步

本机 v3 仍是唯一权威存储。绑定邮箱后，前端把 v3 快照备份到 Supabase `checkin_sync` 表（迁移见 `services/supabase/migrations/`）：

| v3 字段 | `checkin_sync` 列 | 说明 |
| --- | --- | --- |
| `userCode` | `user_code` | 业务码随行，非身份。 |
| `startDate` | `start_date` | `date`，与 v3 日期键同源。 |
| `records` | `records` | `jsonb`，键仍为 `YYYY-MM-DD` 本地日期键，结构与 `DayRecord` 一致。 |
| `heightCm` | `height_cm` | `numeric`，可空；缺省表示未填写身高。 |
| `initialWeightKg` | `initial_weight_kg` | `numeric`，可空；缺省表示自动推导初始体重。 |

规则：

1. 首次合并按 `auth.uid` 幂等执行。只有本地 `records` 为空且云端存在快照时才直接恢复云端快照，并先保留本地备份；本地明确填写的档案字段优先于云端，其余字段由云端补齐。
2. 本地非空、云端为空时上传本地种子；两边均有记录时按日期键取并集，同日期冲突以本地为准，云端独有日期保留并回填本地，随后由 UI 重新水合。
3. `heightCm` 与 `initialWeightKg` 采用 `local ?? cloud`：本地有值优先，本地缺失才补云端。仅档案字段变化也必须触发云端更新。
4. 完成首次合并后，后续保存按当前本地快照做覆盖式增量备份；失败不影响本地，后续保存可重试。
5. 合并标记的数据版本升级为 `junheng-checkin-v3-union-v1`，使旧版已合并账号只补跑一次日期并集回填；不得清空标记或反复覆盖云端档案。
6. 服务端认证身份（Supabase uid）与本机 `userCode` 是两套标识；未来服务端体验官身份另立 `identity-v1` 契约，不得把 `userCode` 当登录账号。
7. 服务端时间戳使用 UTC ISO 8601，与本机 `YYYY-MM-DD` 日期键不冲突；未来服务端打卡必须另立契约，不得修改本 v3。
8. RLS：体验官只能读写自己 uid 的行；管理员经 `camp_admins` 白名单获得只读权限，走 `admin_checkin_overview()` RPC。新增档案列不改变既有 RLS 或管理员返回字段。
9. **10.7 盒码额度增量**：已激活用户的普通增量备份必须改走 `verify_checkin(p_start_date, p_records, p_height_cm, p_initial_weight_kg)`，由服务端在同一事务内锁定当前盒码、校验 active 状态与剩余额度、保存云端快照、按 Asia/Shanghai 物理日写幂等记录并追加审计。首次合并、激活前建档及激活后的无变化保持性同步不消耗额度；未激活用户沿用既有直接同步路径。
10. 同一盒码同一物理日的重复保存仍更新快照并返回 `idempotent=true`，但 `used_checkins` 不得重复递增；跨物理日才允许再扣 1 次。非 active（含 `pending_review`）或 `used_checkins >= max_checkins` 时 RPC 抛错并整体回滚，前端不得伪造成功或自行推算服务端额度。
11. 历史盒码迁移时以 `SystemConfig.max_checkins_per_box` / `default_box_spec` 补齐额度快照，`used_checkins` 初始为 0；该兼容不回写或绕过既有码生命周期状态。前端通过 `get_checkin_quota()` 读取 `remainingCheckins / maxCheckins`，不把默认值当作已激活凭证。

## 教练雷达只读 RPC（10.5 增量）

`get_coach_radar_v1()` 只读当前 `user_coach_relation` 与本人 `checkin_sync` 快照，不改变本机 v3 的权威地位，也不修改云端记录。当前关系通过 `LEFT JOIN` 连接快照，因此刚激活、尚未产生有效打卡的营员仍必须出现在所属教练雷达中。

- 当前体重严格按第 6 节 `getRepresentativeWeight` 语义计算；早晨净重使用每日 `clothes` 快照，有效节点按 60% / 20% / 20% 重归一化并保留既有精度。
- 初始体重优先使用有效的 `initial_weight_kg`，缺省时取当前 21 天窗口内最早有效代表体重；当前体重取窗口内最晚有效代表体重。
- 腰围差使用窗口内最早和最晚有效值；BMI 使用当前 `height_cm` 与当前有效代表体重。数据不足时对应派生字段为 `null`。
- 有效打卡日期沿用第 2 节 `hasContent` 语义；灯号使用服务端 `Asia/Shanghai` 自然日，未打卡、断卡 3 天及以上为红灯，断卡 2 天为黄灯，其余为绿灯。结营未复购红灯优先级保持不变。
- 10.5 用户行严格返回 `camper_code / weight_delta / waist_delta / bmi / alert_level` 五字段，不返回 `stage`、身高、原始体重、原始腰围或 `records`。
- 调用者只取服务端 `auth.uid()`。有效 coach 仅看当前 `referrer_id` 为本人且 `valid_to IS NULL` 的关系；有效 admin 按管理职责查看；其他角色默认无结果。RPC 不接受客户端范围参数。

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
