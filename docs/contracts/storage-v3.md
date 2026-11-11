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
12. **10.11 产品有效期增量**：`box_codes.expires_at` 为可空 `timestamptz` 快照。`SystemConfig.box_code_expiry_policy` 使用 JSON 对象 `{"default_expires_at": "<RFC 3339 时间戳>"}` 提供发码批次默认截止时刻；不播种业务字面值，运营必须通过受控配置层写入真实批次有效期。
13. `generate_platform_codes` 必须在服务端读取并锁定 `box_code_expiry_policy`，将 `default_expires_at` 显式写入本次生成的每枚码；RPC 不新增有效期入参，前端不得传参覆盖。配置缺失、字段缺失或值为 `null` 时以 `SYSTEM_CONFIG_MISSING` 整体回滚，不使用默认值放行。
14. `verify_checkin` 在 active 状态校验之后、同日幂等与额度扣减之前读取 `box_code_expiry_policy`。配置缺失或无效时以 `SYSTEM_CONFIG_MISSING` 拒绝；`expires_at` 缺失或 `expires_at <= now()` 时以 `CHECKIN_CODE_EXPIRED` 拒绝并整体回滚。未过期码才进入既有幂等与额度流程；过期不删除或改写历史打卡及归属事实。

## 教练雷达只读 RPC（10.5 增量）

`get_coach_radar_v1()` 只读当前 `user_coach_relation` 与本人 `checkin_sync` 快照，不改变本机 v3 的权威地位，也不修改云端记录。当前关系通过 `LEFT JOIN` 连接快照，因此刚激活、尚未产生有效打卡的营员仍必须出现在所属教练雷达中。

- 当前体重严格按第 6 节 `getRepresentativeWeight` 语义计算；早晨净重使用每日 `clothes` 快照，有效节点按 60% / 20% / 20% 重归一化并保留既有精度。
- 初始体重优先使用有效的 `initial_weight_kg`，缺省时取当前 21 天窗口内最早有效代表体重；当前体重取窗口内最晚有效代表体重。
- 腰围差使用窗口内最早和最晚有效值；BMI 使用当前 `height_cm` 与当前有效代表体重。数据不足时对应派生字段为 `null`。
- 有效打卡日期沿用第 2 节 `hasContent` 语义；灯号使用服务端 `Asia/Shanghai` 自然日，未打卡、断卡 3 天及以上为红灯，断卡 2 天为黄灯，其余为绿灯。结营未复购红灯优先级保持不变。
- 10.5 用户行严格返回 `camper_code / weight_delta / waist_delta / bmi / alert_level` 五字段，不返回 `stage`、身高、原始体重、原始腰围或 `records`。
- 调用者只取服务端 `auth.uid()`。有效 coach 仅看当前 `referrer_id` 为本人且 `valid_to IS NULL` 的关系；有效 admin 按管理职责查看；其他角色默认无结果。历史无参 RPC 不接受客户端 ID 或任意范围参数；TASK-10.13-CORE-UNLOCK 新增的显式 scope 重载只接受 `own / all`，其准教练与 Admin 权限矩阵以本节后的晋升增量为准。

## 教练云库存与码池流水（10.8 增量）

本增量不改变本机 v3 快照、打卡记录或既有激活状态机，只扩展服务端盒码库存：

1. `coach_inventory` 以 `coach_id` 唯一标识库存持有者，记录累计划拨数、当前可用码数与并发版本；正常持有者是正式 coach，TASK-10.13-FINAL-CLEARANCE 形成的 staff 持有记录仅作为历史事实保留，不授予 staff 查询或操作权限。可用数不得为负。平台未划拨码由 `box_codes.inventory_status = 'platform'` 的码行构成，不另设可被客户端改写的库存计数。
2. `inventory_logs` 为追加式台账，逐笔记录平台生成、教练或直营员工划拨和激活扣减的操作者、数量、服务端时间、关联码/箱及 `offline_receipt_no`。平台生成必须填写非空线下打款凭证号；流水不得记录完整码面。
3. `generate_platform_codes` 与 `allocate_codes_to_coach` 仅允许 `camp_admins` 中有效 `role = 'admin'` 的调用者执行。`p_count` 接受任意正整数，不再要求 24 的倍数，也不另设固定上限；每枚码仍表示一盒，每箱最多 24 枚只是既有物理装箱边界，尾箱按实际数量落码并写同额 `platform_generated` 流水，不得把整箱 24 写进部分箱流水。生成时分别读取并锁定 `max_checkins_per_box` 与 `default_box_spec` 配置，显式写入每枚码的快照；配置缺失或与请求规格不一致时 fail-closed。划拨在同事务内锁定平台未分配码行，数量不足整体失败，不得超发。
4. 码面仅以服务端密钥加密后的 `code_ciphertext` 保存；表权限继续对客户端关闭。仅正式 coach 可通过 `get_my_code_inventory` 读取本人 `unused` 且已划拨码的解密码面；staff 即使本人存在历史持有记录，也必须以 `FORBIDDEN` / SQLSTATE `42501` 拒绝，其他角色及任何非本人持有者的码不得返回。
5. `activate_box_code` 在既有码、激活申请和归属锁之后锁定持有者库存行；持有者码激活时必须同步扣减一个可用库存并追加流水，库存不存在或不足时以 `INVENTORY_INSUFFICIENT` 整体回滚。历史平台码没有库存行时不得伪造持有者扣减。
6. 多表写锁顺序遵循 [BIZ-V1.2]：`box_codes` → `code_activations` → `user_coach_relation` → `coach_inventory`；所有 RPC 由数据库函数提供单事务原子性。
7. **TASK-10.12-P0 配置适配**：`get_my_code_inventory` 必须从 `vault.decrypted_secrets` 按名称 `box_code_pepper` 读取解密密钥，不再读取 `current_setting('app.box_code_pepper')`。密钥缺失或为空时抛出独立错误码 `BOX_CODE_PEPPER_NOT_CONFIGURED`，前端统一显示“系统维护中，请稍后重试。”；仓库、前端和错误响应不得包含密钥。
8. **TASK-10.13-UX-FLOW-FIX 浏览器签名兼容**：`get_coach_inventory_v3(p_dummy boolean default null)` 是 `get_my_code_inventory()` 的安全包装，显式传 `null` 与省略参数均返回完全相同的 JSON 契约；`p_dummy` 仅供 PostgREST 缓存规避，不参与鉴权或业务计算。包装不得复制库存查询或旧版权限逻辑，必须委托最新函数以保留正式 coach 本人库存、staff／准教练及普通用户拒绝、Vault 缺失及配置语义。撤销 `public / anon` 执行权，仅授予 `authenticated`。

## 服务教练联系方式（TASK-10.12 增量）

1. `coach_contact_profiles` 仅保存教练 `coach_id`、业务手机号 `phone` 与微信号 `wechat`，由受控服务端配置；表启用 RLS，浏览器角色无直读或直写权限。
2. `get_my_coach_contact_v1` 仅按服务端 `auth.uid()` 查找 `user_coach_relation` 中当前有效归属，并返回该教练的 `phone / wechat`；不接受用户 ID、教练 ID 或范围参数。
3. RPC 不返回营员代码、身高、体重、原始记录或其他教练资料。无当前归属、未配置联系方式或匿名调用时均返回空结果，前端不得用本地输入或硬编码联系方式补齐。

## 管理端教练目录与审核归属（TASK-10.12 增量）

1. `admin_get_coach_directory(p_query)` 仅允许服务端 `auth.uid()` 对应的有效 `camp_admins.role = 'admin'` 调用；查询至少 2 个字符，仅搜索有效教练邮箱，最多返回 10 条 `coach_id / email / name / phone`。姓名取认证资料中的 `full_name`（兼容 `name`），手机号取受限 `user_profiles.phone` 并兼容认证手机号；缺省返回 `null`。浏览器不得直读 `auth.users`、`user_profiles` 或角色目录，RPC 不返回健康原始记录或微信号。
2. 管理端划拨与人工审核只通过邮箱搜索选择教练，下拉结果同时展示邮箱、姓名、手机号；选中后由前端提交服务端返回的 `coach_id`，页面不展示或要求手填 UUID。联系方式扩展只在 Admin 严格鉴权后生效，普通用户、教练与 staff 均无此目录权限；服务端仍须独立校验管理员权限与教练有效状态，不信任前端选择结果。
3. `admin_review_box_code_activation_v2` 在原有原子审核事务前接收 `p_target_coach_id`，要求其为有效教练且与待审核产品码当前 `box_codes.coach_id` 一致，否则以 `COACH_SELECTION_MISMATCH` 拒绝。审核凭证、乐观版本与原审核状态机保持不变；本包装不提供任意改派归属能力。
4. **TASK-10.13 统一教练口径**：目录搜索、`allocate_codes_to_coach` 与审核 v2 均以 `camp_admins` 中 `role = 'coach' AND is_active AND auth_user_id IS NOT NULL` 的角色行证明教练身份。`user_coach_relation` 只回答当前归属，不再回答谁是教练；不得仅凭 `auth.users` 或当前学员关系认定教练。目录无结果属于正常空态，前端显示“无匹配教练”，不得作为 RPC 错误展示红字。
5. **历史白名单回填**：迁移在事务内通过规范化邮箱连接 `auth.users`，仅为 `camp_admins.auth_user_id IS NULL` 的历史行回填认证主体；跳过已被其他角色行占用的认证主体，未匹配行继续保持 NULL 和无业务权限。客户端不得执行裸 UPDATE，角色本身不得因回填自动变更。

## 教练工作流、跟进与补货（TASK-10.12 模块二增量）

本增量不改变五字段 `get_coach_radar_v1`、P0 Vault 读取方式、人工审核状态机或库存扣减时点。新增浏览器表权限全部关闭，权威读写只经下列 RPC；调用者身份只取服务端 `auth.uid()`，不接受 coach ID 作为可见范围参数。教练身份统一按 TASK-10.13 的 `camp_admins` 角色行判定，营员范围仍由当前有效关系决定。

1. **本人营员列表**：`get_coach_campers_v1()` 仅由 `user_coach_relation.referrer_id = auth.uid() AND valid_to IS NULL` 的当前关系驱动，返回不透明 `camper_ref`（当前 `relation_id`）、`camper_code`、`activity_status` 与本人跟进字段，不返回认证 UID、邮箱、原始健康记录或其他教练用户。`activity_status = 'new_registered'` 表示当前 21 天窗口内没有任何符合第 2 节 `hasContent` 语义的记录；存在至少一条则为 `'active'`。灯号仍由五字段雷达独立给出，禁止再用“绿灯”代替活跃口径。
2. **跟进备注**：`coach_camper_followups` 以 `(coach_id, camper_id)` 唯一保存 `followup_status / note / version / updated_by / updated_at`；状态仅允许 `pending / contacted / waiting_reply / resolved / escalated`，备注去除首尾空白后最多 1000 字。表启用 RLS 且浏览器角色无直读直写权限。教练通过 `get/set_coach_camper_followup_v1` 读写当前 `camper_ref` 对应本人营员，Admin 通过 `admin_get/set_camper_followup_v1` 按管理职责读写；其他教练、历史归属与匿名调用一律 `FORBIDDEN`。更新采用 `expected_version`：新建为 0，已有记录必须精确匹配，冲突返回 `FOLLOWUP_VERSION_CONFLICT`，不得最后写入者无声覆盖。
3. **无码补货申请**：`coach_restock_requests` 保存 `request_id / coach_id / note / status / created_at / resolved_by / resolved_at`，状态为 `pending / fulfilled / rejected`，同一教练最多一条 pending。`request_coach_restock_v1` 要求有效 `camp_admins.role = 'coach'` 身份，并在本人 `available_count = 0` 且不存在本人 `unused` 码时创建；重复申请幂等返回原 pending，其他情况返回 `RESTOCK_NOT_EMPTY`。备注最多 500 字，不含码面或健康记录。
4. **Admin 补货需求**：`admin_get_coach_restock_requests_v1` 仅有效 admin 可读，最小返回 `request_id / coach_id / note / status / created_at`。`admin_resolve_coach_restock_request_v1` 锁定 pending 申请后可驳回；标记 fulfilled 前必须核实该教练已有可用库存，否则 `RESTOCK_NOT_FULFILLED`。该接口只关闭需求单，不代替既有 `allocate_codes_to_coach` 划拨事务。
5. **教练直推码**：`coach_push_code_v1(p_camper_ref, p_code_id, p_idempotency_key)` 先核实调用者具有有效 coach 角色，再锁定并核实码为调用教练本人 `inventory_status = 'coach' AND state = 'unused'`，再锁定 `p_camper_ref` 对应的当前关系并核实 `referrer_id = auth.uid()`；其他教练的码、历史/非本人营员均返回 `CODE_NOT_AVAILABLE` 或 `FORBIDDEN`，不得泄露目标是否存在。函数使用 Vault `box_code_pepper` 计算幂等载荷与识别码格式，密钥缺失返回 `BOX_CODE_PEPPER_NOT_CONFIGURED`。
6. 直推成功只插入目标营员的 pending `code_activations`、将码推进为 `pending_review`、写 `CodeActivationRequested` 与幂等命令；目标营员与 camper code 均取服务端关系，不能由客户端传入。后续仍只能经既有 Admin 人工审核原子流程激活并扣减一次库存；直推本身不得激活、不得改归属、不得扣库存，重复幂等请求不得创建第二条申请或重复扣减。
7. **D21 趋势**：营期日严格由 `startDate + (dayIndex - 1)` 映射，D21 只读取第 21 个本地日期；窗口外记录不得成为本期基线或串入 D21。两张图共用同一 21 点数组与 X 轴边距、padding 和刻度策略，D1/D21 均保留且不裁切。
8. **新教练 Demo**：仅使用前端独立常量中的明确虚构营员与库存示意，标记 `isDemo = true`，文案同时标明“演示数据 / 非真实统计”。仅在真实营员为空且加载成功后展示，不计入真实人数、灯号、云仓、导出或任何 RPC；无真实码面、无真实 ID、无写操作，有真实营员时不得混入。

## D1–D21 营期趋势聚合只读 RPC（TASK-10.13-CORE-FIX 增量）

`get_coach_camp_trends_v1(p_scope text)` 是仅供有效 Admin 与有效 coach 使用的只读聚合接口。`p_scope` 必须显式为 `'own'` 或 `'all'`；其他值（含 `NULL`）以 `INVALID_SCOPE` 拒绝。函数返回固定 21 行，`day_index` 严格为 1–21 且升序唯一，Supabase/PostgREST JSON 响应即 21 点数组；不得返回用户 ID、邮箱、营员代码、真实日期、原始 `records` 或任何单用户逐日记录。

| 调用者（均由服务端 `auth.uid()` 判定） | `scope='own'` | `scope='all'` |
| --- | --- | --- |
| 有效 Admin | 允许；仅当前 `user_coach_relation.referrer_id = auth.uid() AND valid_to IS NULL` 的营员 | 允许；全栈所有 `checkin_sync` 快照，不要求营员仍有有效归属 |
| 有效 coach | 允许；口径同上，仅限本人名下 | 允许；与 Admin 相同的全栈物理聚合，不返回任何用户明细或 PII |
| 有效 staff（含存在教练分配者） | `FORBIDDEN` | `FORBIDDEN` |
| 普通用户、失效角色或无角色行 | `FORBIDDEN` | `FORBIDDEN` |
| 匿名调用 | `UNAUTHORIZED` | `UNAUTHORIZED` |

返回行契约如下；计数为 JSON integer，聚合指标为 JSON number 或 `null`：

| 字段 | 类型 | 定义与空样本规则 |
| --- | --- | --- |
| `day_index` | integer | D1–D21；记录日期必须等于该营员 `start_date + (day_index - 1)`。 |
| `participants` | integer | 当日符合第 2 节 `hasContent` 语义的去重营员数；无样本为 `0`。同时是四项行为率的分母。 |
| `weight_samples` | integer | 当日同时具有有效代表体重及本人窗口内有效体重基线的样本数；无样本为 `0`。 |
| `waist_samples` | integer | 当日同时具有有效腰围及本人窗口内有效腰围基线的样本数；无样本为 `0`。 |
| `avg_weight_change_percent` | numeric，可空 | 先对每名营员计算 `(当日代表体重 - 基线) / 基线 × 100` 并保留 1 位小数，再对当日样本求均值并保留 1 位小数；`weight_samples = 0` 时为 `null`。 |
| `avg_waist_change_percent` | numeric，可空 | 腰围使用同一变化率与舍入规则；`waist_samples = 0` 时为 `null`。 |
| `meal_completion_rate` | numeric，可空 | 当日有内容记录的三餐完成项数 ÷（`participants × 3`）× 100，保留 1 位小数；`participants = 0` 时为 `null`。 |
| `water_rate` | numeric，可空 | 当日有内容记录中 `water = true` 的人数 ÷ `participants` × 100，保留 1 位小数；空样本为 `null`。 |
| `movement_rate` | numeric，可空 | 与 `water_rate` 同口径统计 `movement = true`。 |
| `sleep_rate` | numeric，可空 | 与 `water_rate` 同口径统计 `sleep = true`。 |

1. 每名营员的 21 天窗口只含 `start_date` 至 `start_date + 20`；窗口外记录不得进入当日值或基线。体重严格使用综合代表体重，体重和腰围分别以各自窗口内最早有效值为基线，不使用自定义初始体重替代该营期变化率基线。
2. 两种 scope 使用完全相同的返回字段与聚合语义；`own` 必须通过当前有效 coach 关系过滤，并用 `EXISTS` 或等效去重结构防止关系连接放大样本。Admin 与 coach 的 `own` 均不扩张为全栈；二者的 `all` 均只返回同一套全栈聚合结果，coach 不得通过任何参数读取他人或其他教练的用户明细。
3. 所有比率单位均为百分比（0–100），不是 0–1 小数。`participants` 与两个变化率样本计数始终为非负整数；任何聚合值不得用 `0` 冒充空样本。
4. 函数必须为 `STABLE`、只执行读取与聚合，不含 INSERT、UPDATE、DELETE、MERGE、TRUNCATE、锁行或其他写副作用；使用 `SECURITY DEFINER` 时必须固定 `search_path = public, pg_temp`，仅授予 `authenticated` 执行权，并在函数内独立执行上述权限矩阵。

## Admin 员工 RBAC 与界面权限（TASK-10.12 增量）

1. `camp_admins.role` 仅允许 `admin / coach / staff`，并增加 `version / updated_at / updated_by` 支持乐观并发与审计；历史 Admin 白名单回填与 Vault 密钥读取保持不变。staff 只能由有效 Admin 通过 RPC 授予、停用或恢复，不能把已有 admin/coach 行改写为 staff，也不能凭邮箱或前端声明自助提权。coach 只能经 `admin_set_coach_role` 或后续获批的晋升事务写入，不能把已有 admin/staff 行改写为 coach。
2. `staff_coach_assignment` 保存员工与教练的分配历史。创建分配要求目标 staff 有效、目标教练具有有效 `camp_admins.role = 'coach'` 角色行，并校验 `expectedVersion` 与 `idempotencyKey`；撤销立即结束有效期并递增版本。浏览器角色对角色表、分配表、命令表与审计表无直写权限。
3. Admin 员工管理区只调用 `admin_get_staff_directory / admin_set_staff_role / admin_assign_staff_coach / admin_revoke_staff_coach`。所有管理 RPC 在服务端以 `auth.uid()` 验证有效 Admin，成功的角色变更与分配变更均追加审计；拒绝异常不承诺审计落库，不得在异常回滚前写入虚假的拒入审计。审计不记录体验官明细、联系方式或财务金额。
4. `get_coach_radar_v1` 对 staff 仅返回当前有效分配教练名下的五字段脱敏雷达，仍由服务端 `auth.uid()` 决定范围，不接受 coach、staff、体验官或分页范围参数。分配撤销、staff 停用或用户转移后，新请求立即失去对应数据。
5. `get_my_access_profile` 仅返回当前有效角色及 `can_view_radar / can_manage_inventory` 两个界面能力。前端据此隐藏员工不可见模块，但隐藏不是授权；TASK-10.15 起 staff 的 `can_manage_inventory` 必须为 `false`，仅保留当前分配范围雷达能力。正式 coach 继续为 `true`，`get_my_code_inventory` 仍在服务端按 `auth.uid()` 和有效 coach 角色独立鉴权，其他 Admin RPC 独立鉴权。
6. 既有 `admin_checkin_overview` 与 `checkin_sync` Admin 直读策略必须同时限定有效 `role = 'admin'` 的认证主体，防止 staff 借历史白名单策略读取体验官记录。
7. 员工分配沿用 `staff-role-permissions-v1.md` 的非阻断软容量口径：超过 5 名教练或 150 名当前体验官仍允许成功，返回 `STAFF_CAPACITY_WARNING`、在 Admin 显示红字并追加容量警告与治理跟进审计，不得将其实现为硬限制。

## 双路径激活唯一终审与来源审计（TASK-10.13 增量）

1. `code_activations.request_source` 为必填且不可变的 `manual_code / coach_push`，分别只能由 `request_box_code_activation` 与 `coach_push_code_v1` 写入；两条路径的 `CodeActivationRequested` 事件 metadata 同步保存 `requestSource`。历史行按请求事件的 actor 与申请人是否一致回填，无该事件的 10.9 前自助申请归为 `manual_code`。回填仅在同一事务内临时禁用真实 `code_activation_mutation_guard`，完成后立即恢复，不递增存量 `version`；异常由事务整体回滚，随后启用的来源不可变守护不受影响。
2. 两条 pending 申请仍只经 `admin_review_box_code_activation_v2` 公开终审；其内部复用既有 `admin_review_box_code_activation` 原子事务，继续强制有效 Admin、目标持有者与码归属一致、码和申请双版本匹配。目标持有者默认是有效 coach；TASK-10.13-FINAL-CLEARANCE 仅允许符合第 3.1 节范围证明的有效直营 staff 持有码进入同一终审，营员归属仍为当前关系中的 coach。旧 `activate_box_code(text,text)` 与 `activate_box_code(text,integer,integer,text)` 必须删除，原审核函数对浏览器角色回收执行权限，禁止形成第二终审或自助激活路径。
3. 两入口在读取 `box_code_commands` 前按同一幂等键获取事务级咨询锁，串行化并发首写；同键同载荷返回首次结果并标记 `replayed=true`，同键异载荷返回 `IDEMPOTENCY_CONFLICT`，不得创建第二条申请。既有码行锁、状态冲突与终审乐观版本语义保持不变。
4. TASK-10.15 起调用 `coach_push_code_v1` 必须具有有效 `camp_admins.role = 'coach'`；staff 即使保留有效分配、关系和库存，也必须在 Vault、幂等命令与目标读取之前以 `FORBIDDEN` / SQLSTATE `42501` 拒绝，不得返回成功 JSON 或产生副作用。有效教练只能使用本人云库存 unused 码及本人当前营员关系。两入口均从 Vault `box_code_pepper` 读取密钥，缺失错误码为 `BOX_CODE_PEPPER_NOT_CONFIGURED`，不得回退 GUC。
5. 既有终审 `audit_logs` 在插入时由数据库触发器从申请行补充 `requestSource`，通过和拒绝均保留来源；不得在终审函数之外另写激活、归属或库存状态。
## 教练身份 SSOT 与 Pepper Vault（TASK-10.13 增量）

1. **唯一身份来源**：`camp_admins` 中 `role = 'coach' AND is_active AND auth_user_id IS NOT NULL` 是“谁是教练”的唯一事实源；`user_coach_relation` 只回答“谁名下有哪些当前营员”。目录、划拨、staff 分配、审核、补货、雷达、权限档案、云库存、营员列表、跟进与直推不得再以当前学员数或 `auth.users` 存在代替教练身份。
2. **受控写入**：`admin_set_coach_role(p_email, p_is_active, p_expected_version, p_idempotency_key)` 仅有效 Admin 可调用。新建要求版本 0，已有行必须精确匹配版本；同一幂等键、命令类型、载荷与调用者可重放原结果，异载荷或异调用者返回 `IDEMPOTENCY_CONFLICT`。创建、变更、停用均递增版本并写成功审计；已有 admin/staff 行或其他认证主体占用行返回 `ROLE_ASSIGNMENT_CONFLICT`，不得降成 coach。
3. **存量安全回填**：迁移为当前有效关系中的教练创建或同步有效 coach 角色行，已有停用 coach 行恢复有效，保证存量教练不断权；已有 admin/staff 角色行保持不变，认证主体或规范化邮箱被其他角色占用时跳过，不自动降权或抢占身份。`SystemConfig.platform_official_account_id` 指向的平台官方账号即使持有当前归属关系，也不得被回填为 coach。
4. **空盘教练**：没有当前营员的新教练仍可被 Admin 目录搜索、staff 分配、码池划拨、审核选择与补货申请，并可读取本人 `get_my_access_profile`、空雷达和空云库存。`admin_get_coach_directory` 联系方式仍仅向有效 Admin 返回；普通用户、coach、staff 均不能枚举该目录。
5. **最小权限**：coach 只能读取或操作本人当前营员、本人库存与本人跟进；staff 的雷达继续只读当前有效分配范围内的脱敏字段，不能读取教练目录。TASK-10.15 撤销 TASK-10.13-FINAL-CLEARANCE 的本人库存与受控直推例外，staff 不得成功调用库存查询、补货或直推码 RPC，具体边界见 staff-role-permissions-v1.md 第 3.1 节。角色停用后，新请求立即失去相应能力，但历史归属、激活与审计事实不改写。
6. **Vault 全链路收口**：所有最新生效且需要 `box_code_pepper` 的 RPC 必须从 `vault.decrypted_secrets` 按 `name = 'box_code_pepper'` 读取，不再读取 `current_setting('app.box_code_pepper')`。覆盖生成、手动申请、旧激活函数、待审列表、审核补发、云库存与教练直推；密钥缺失或为空时统一抛出或返回 `BOX_CODE_PEPPER_NOT_CONFIGURED`，不得回退 GUC 或泄露密钥。保留各函数原签名、事务边界、授权状态与业务语义。

## 教练身份 SSOT 与 Pepper Vault（TASK-10.13 增量）

1. **唯一身份来源**：`camp_admins` 中 `role = 'coach' AND is_active AND auth_user_id IS NOT NULL` 是“谁是教练”的唯一事实源；`user_coach_relation` 只回答“谁名下有哪些当前营员”。目录、划拨、staff 分配、审核、补货、雷达、权限档案、云库存、营员列表、跟进与直推不得再以当前学员数或 `auth.users` 存在代替教练身份。
2. **受控写入**：`admin_set_coach_role(p_email, p_is_active, p_expected_version, p_idempotency_key)` 仅有效 Admin 可调用。新建要求版本 0，已有行必须精确匹配版本；同一幂等键、命令类型、载荷与调用者可重放原结果，异载荷或异调用者返回 `IDEMPOTENCY_CONFLICT`。创建、变更、停用均递增版本并写成功审计；已有 admin/staff 行或其他认证主体占用行返回 `ROLE_ASSIGNMENT_CONFLICT`，不得降成 coach。
3. **存量安全回填**：迁移为当前有效关系中的教练创建或同步有效 coach 角色行，已有停用 coach 行恢复有效，保证存量教练不断权；已有 admin/staff 角色行保持不变，认证主体或规范化邮箱被其他角色占用时跳过，不自动降权或抢占身份。`SystemConfig.platform_official_account_id` 指向的平台官方账号即使持有当前归属关系，也不得被回填为 coach。
4. **空盘教练**：没有当前营员的新教练仍可被 Admin 目录搜索、staff 分配、码池划拨、审核选择与补货申请，并可读取本人 `get_my_access_profile`、空雷达和空云库存。`admin_get_coach_directory` 联系方式仍仅向有效 Admin 返回；普通用户、coach、staff 均不能枚举该目录。
5. **最小权限**：coach 只能读取或操作本人当前营员、本人库存与本人跟进；staff 的雷达继续只读当前有效分配范围内的脱敏字段，不能读取教练目录。TASK-10.15 撤销 TASK-10.13-FINAL-CLEARANCE 的本人库存与受控直推例外，staff 不得成功调用库存查询、补货或直推码 RPC，具体边界见 staff-role-permissions-v1.md 第 3.1 节。角色停用后，新请求立即失去相应能力，但历史归属、激活与审计事实不改写。
6. **Vault 全链路收口**：所有最新生效且需要 `box_code_pepper` 的 RPC 必须从 `vault.decrypted_secrets` 按 `name = 'box_code_pepper'` 读取，不再读取 `current_setting('app.box_code_pepper')`。覆盖生成、手动申请、旧激活函数、待审列表、审核补发、云库存与教练直推；密钥缺失或为空时统一抛出或返回 `BOX_CODE_PEPPER_NOT_CONFIGURED`，不得回退 GUC 或泄露密钥。保留各函数原签名、事务边界、授权状态与业务语义。

## 教练晋升状态机与准教练权限（TASK-10.13-CORE-UNLOCK 增量）

本增量只扩展服务端晋升档案与受控 RPC，不改变本机 v3、打卡扣次、双路径激活、教练身份 SSOT 或 Vault 口径。21 / 8 为裁判终裁播种值，仍由 RPC 和触发器从 `system_configs` 动态读取；配置缺失、非整数或不大于零时以 `SYSTEM_CONFIG_MISSING` fail-closed，客户端不得传入阈值或打卡天数。

1. **档案与配置**：`coach_promotions` 每次申请一行，字段为 `promotion_id / auth_user_id / state / checkin_days_snapshot / recruit_baseline / decided_by / decided_at / rejection_reason_code / version / created_at / updated_at`。物理状态仅允许 `promotion_pending / promotion_rejected / probational_coach / coach`；无档案时本人查询返回虚拟状态 `camper`。部分唯一索引保证同一用户最多一条 `promotion_pending`，且最多一条 `probational_coach / coach` 当前档案；拒绝行永久保留，允许另开新申请。
2. **有效打卡**：`request_coach_promotion()` 不接受业务参数，以 `auth.uid()` 为申请人，按 `checkin_daily_claims.physical_day` 去重，并连接本人已批准、已激活的 `code_activations`、active 盒码及正数扣次证据计算有效天数。达到 `coach_promotion_required_checkins` 才插入 pending 并写 `coach_promotion_requested` 审计；不足时以 `PROMOTION_CHECKINS_INSUFFICIENT` 拒绝。已有 pending 幂等返回原单，按用户咨询锁与唯一索引防并发重复；已有准教练或正式教练档案不得另开申请。
3. **本人只读**：`get_my_coach_promotion()` 只按服务端 `auth.uid()` 返回最新本人状态、申请 ID、打卡快照、直推基数、拒绝原因码、版本与时间，不返回审核人或其他用户档案。匿名调用以 `UNAUTHORIZED` 拒绝；表启用 RLS，`anon / authenticated` 对档案与审计表无直接读写权限。
4. **Admin 审核**：`admin_review_coach_promotion(p_promotion_id uuid, p_decision text, p_expected_version integer, p_reason_code text default null)` 仅允许有效 `camp_admins.role='admin'`。函数锁定 pending 行并校验版本；`approve` 时重新计算有效打卡并快照当前真实直推基数，原子写入 `probational_coach` 与 `coach_promotion_approved` 审计；`reject` 必须提供非空原因码，原子写入 `promotion_rejected` 与 `coach_promotion_rejected` 审计。非 Admin、重复审核、版本冲突及缺失原因分别失败，不得由申请人自助审批。
5. **真实直推与自动晋升**：当前关系必须满足 `referrer_id = 准教练本人 AND valid_to IS NULL`，且营员、来源码、已批准并实际激活的申请及 active 盒码一致。历史关闭、pending / rejected / 未激活、间接关系、自我关系及 `platform_official_account_id` 指向的平台账号均不计数。关系写入后的受控触发器按申请人咨询锁和档案行锁串行化，仅处理 `probational_coach`；当 `当前真实直推数 - recruit_baseline >= probational_coach_required_recruits` 时，在同一事务把档案推进 `coach`、创建或恢复有效 `camp_admins(role='coach')` 并追加 `coach_promotion_promoted` 审计。任一步失败整体回滚；不得写入 `coach_lifecycles`，不得误晋升普通营员、staff、Admin 或其他非准教练。
6. **准教练雷达与趋势**：`get_coach_radar_v1(p_scope text)` 与既有无参兼容入口允许准教练读取本人当前名下五字段雷达；显式 `own` 与无参结果一致。`get_coach_camp_trends_v1('own')` 允许准教练读取同一当前关系的 21 点聚合。两种接口的 `all` 对准教练均以 `FORBIDDEN` 拒绝，其他 scope 以 `INVALID_SCOPE` 拒绝；Admin 的 all、正式 coach 的既有趋势 all 及 staff 的分配范围不回归。
7. **库存与写能力 fail-closed**：准教练调用 `get_my_code_inventory / generate_platform_codes / allocate_codes_to_coach / coach_push_code_v1 / request_coach_restock_v1` 必须在服务端角色与晋升状态校验处、读取 Vault 或业务目标之前以 `FORBIDDEN` 拒绝。Admin 划拨与平台发码仍需有效 Admin；正式 coach 的本人库存、直推与补货行为保持原契约。不得仅凭前端隐藏或 `get_my_access_profile` 的显示值授权。
8. **审计与权限**：既有 `audit_logs.action` 扩展 `coach_promotion_requested / coach_promotion_approved / coach_promotion_rejected / coach_promotion_promoted`，继续 append-only；晋升审计保存基数、当前真实直推数和配置快照，不含码面或原始健康记录。新 RPC 均 `SECURITY DEFINER` 且固定 `search_path = public, pg_temp`，内部辅助函数与触发器不对浏览器角色授权；公开 RPC 撤销 `public / anon` 执行权，仅按需授予 `authenticated`。

## 三端激活回读、教练在审与营期状态（TASK-10.13-UX-FLOW-FIX 增量）

本增量只新增只读 RPC 并扩展雷达返回维度，不改变双路径申请、Admin 唯一终审、库存扣减、本机 v3 或既有激活状态机。

1. **本人激活状态**：`get_my_activation_status()` 无参数、返回单个 JSON 对象，仅以服务端 `auth.uid()` 读取本人 `created_at` 最新（同刻以 `activation_id` 决胜）的 `code_activations`。固定返回 `state / requested_at / rejection_hint` 三字段：无申请时为 `{"state":"none","requested_at":null,"rejection_hint":null}`；有申请时 `state` 按审核事实映射为 `pending_review / active / rejected`，`requested_at` 为该申请 `created_at`，仅 rejected 时 `rejection_hint = 'contact_coach'`，其余状态为 `null`。匿名以 `UNAUTHORIZED` 拒绝；不得返回码面、code/activation ID、审核人、内部拒绝原因码或他人数据。拒绝历史保持不可变，既有入口允许使用新的可用码重新申请；新 pending 成为最新行后状态自然收敛为 `pending_review`，不额外改写旧行。
2. **教练本人在审列表**：`get_coach_pending_reviews()` 无参数、只读返回 `code_id / code / camper_code / requested_at / entry_path`。调用者必须先由 `camp_admins` 中本人有效 `role = 'coach'` 行鉴权，再读取 Vault `box_code_pepper` 解密码面；匿名返回 `UNAUTHORIZED`，其他角色（含 staff、Admin、准教练和失效 coach）返回 `FORBIDDEN`，密钥缺失沿用 `BOX_CODE_PEPPER_NOT_CONFIGURED`。仅选择 `box_codes.coach_id = auth.uid()`、`inventory_status = 'coach'` 且码与申请均为 pending 的行；`entry_path` 直接取不可变 `request_source`，同时覆盖 `manual_code / coach_push`。`camper_code` 取服务端申请行（手动申请源于本人云端快照、直推源于当前关系），不连接或返回认证 UID、邮箱、原始健康数据、审核信息或其他教练数据。
3. **雷达营期状态**：`get_coach_radar_v1()` 与 `get_coach_radar_v1(p_scope)` 在原五字段后新增 `cycle_state`，原字段顺序、灯号优先级、Admin/coach/staff/准教练权限与脱敏边界不变。函数从 `system_configs.max_checkins_per_box` 读取正整数营期天数，缺失或非法时以 `SYSTEM_CONFIG_MISSING` fail-closed，不新增字面值阈值；窗口结束日为 `start_date + 营期天数 - 1`。服务端 `Asia/Shanghai` 当前日期已超过窗口结束日，且不存在本人已激活且码状态为 active 的 recharge 事实时，返回 `cycle_complete_pending_renewal`，其余为 `in_cycle`。该维度与原断卡灯号独立：满期待续费优先保持红灯，窗口内漏打卡仍只由 `alert_level` 表达，前端不得自行推算。
4. **最小权限**：三个新公开入口及两个雷达重载均为 `STABLE SECURITY DEFINER`，固定 `search_path = public, pg_temp`，撤销 `public / anon` 执行权，仅授予 `authenticated`；函数内仍独立鉴权。不得向浏览器角色新增 `code_activations / box_codes / vault` 直读权限。迁移只新增或替换最新函数，不改写历史迁移。

## 直营员工搜索、历史划拨与 Staff 禁令（TASK-10.15 增量）

1. `admin_search_staff_directory_v1(p_query text)` 仅有效 Admin 可调用，按 email 模糊搜索有效 staff，返回 `staff_id / email / is_active / version / coach_count / camper_count / assignments`，统计及分配 JSON 直接复用 `admin_get_staff_directory`。空或 NULL 查询返回空，非空查询最多 10 条，不返回其他角色或失效 staff。
2. `allocate_codes_to_staff_v1(p_staff_id uuid, p_count integer)` 保持既有 Admin 专用历史能力，不向 staff 授予任何库存读取、补货或直推权限；既有码行、计数、流水与审计语义不在本任务扩大或缩小。
3. TASK-10.15 起 staff 调用 `get_my_code_inventory / get_coach_inventory_v3 / request_coach_restock_v1 / coach_push_code_v1` 均以 `FORBIDDEN` / SQLSTATE `42501` 物理拒绝；库存与直推不得返回数据或产生写入，补货不得创建或修改申请。`admin_review_box_code_activation_v2` 对历史 staff 持有码的 Admin 终审保持原边界，不构成 staff 的新直推能力。详细禁令以 `staff-role-permissions-v1.md` 第 3.1 节为准。
4. **pgcrypto 扩展路径防线**：全量迁移后仍生效且调用 `pgp_sym_decrypt / pgp_sym_encrypt / digest / gen_random_bytes / gen_random_uuid / encode / decode / hmac` 等扩展函数的自定义 RPC，必须固定 `search_path = public, extensions, pg_temp`，或将扩展调用正确限定到 `extensions` 并保持权限安全；不得依赖会话 `search_path` 或将扩展安装到 `public`。公开 RPC 撤销 `public / anon` 执行权，仅授予 `authenticated`，函数内以 `auth.uid()` 独立鉴权。扩展路径补丁不得扩大返回字段、改变鉴权或业务语义，也不得新增平行库存、硬编码账号或业务配置。
5. **包装器与迁移登记**：`get_coach_inventory_v3(boolean)` 虽仅委托其他 RPC，也必须固定 `search_path = public, extensions, pg_temp`，不得因函数体不含 `pgp_sym_` 而漏检。路径补丁必须通过 `pg_proc / pg_namespace` 穷举直接调用 pgcrypto 的 public 普通函数并显式覆盖该包装器，且可重复执行；不得改写历史迁移。`public.supabase_migrations` 仅由迁移执行角色写入，至少登记 `version / filename / sha256 / executed_at / result / execution_environment`，文件 SHA-256 由外部执行器在迁移后计算并登记，禁止在迁移文件内嵌入自身 hash；`public / anon / authenticated` 不得直读或直写该表。

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
