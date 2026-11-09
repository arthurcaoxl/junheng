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
- 调用者只取服务端 `auth.uid()`。有效 coach 仅看当前 `referrer_id` 为本人且 `valid_to IS NULL` 的关系；有效 admin 按管理职责查看；其他角色默认无结果。RPC 不接受客户端范围参数。

## 教练云库存与码池流水（10.8 增量）

本增量不改变本机 v3 快照、打卡记录或既有激活状态机，只扩展服务端盒码库存：

1. `coach_inventory` 以 `coach_id` 唯一标识教练，记录累计划拨数、当前可用码数与并发版本；可用数不得为负。平台未划拨码由 `box_codes.inventory_status = 'platform'` 的码行构成，不另设可被客户端改写的库存计数。
2. `inventory_logs` 为追加式台账，逐笔记录平台生成、教练划拨和激活扣减的操作者、数量、服务端时间、关联码/箱及 `offline_receipt_no`。平台生成必须填写非空线下打款凭证号；流水不得记录完整码面。
3. `generate_platform_codes` 与 `allocate_codes_to_coach` 仅允许 `camp_admins` 中有效 `role = 'admin'` 的调用者执行。生成时分别读取并锁定 `max_checkins_per_box` 与 `default_box_spec` 配置，显式写入每枚码的快照；配置缺失或与请求规格不一致时 fail-closed。划拨在同事务内锁定平台未分配码行，数量不足整体失败，不得超发。
4. 码面仅以服务端密钥加密后的 `code_ciphertext` 保存；表权限继续对客户端关闭。教练只能通过 `get_my_code_inventory` 读取本人 `unused` 且已划拨码的解密码面，其他角色与其他教练的码不得返回。
5. `activate_box_code` 在既有码、激活申请和归属锁之后锁定教练库存行；教练码激活时必须同步扣减一个可用库存并追加流水，库存不存在或不足时以 `INVENTORY_INSUFFICIENT` 整体回滚。历史平台码没有库存行时不得伪造教练扣减。
6. 多表写锁顺序遵循 [BIZ-V1.2]：`box_codes` → `code_activations` → `user_coach_relation` → `coach_inventory`；所有 RPC 由数据库函数提供单事务原子性。
7. **TASK-10.12-P0 配置适配**：`get_my_code_inventory` 必须从 `vault.decrypted_secrets` 按名称 `box_code_pepper` 读取解密密钥，不再读取 `current_setting('app.box_code_pepper')`。密钥缺失或为空时抛出独立错误码 `BOX_CODE_PEPPER_NOT_CONFIGURED`，前端统一显示“系统维护中，请稍后重试。”；仓库、前端和错误响应不得包含密钥。

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
5. `get_my_access_profile` 仅返回当前有效角色及 `can_view_radar / can_manage_inventory` 两个界面能力。前端据此隐藏员工不可见模块，但隐藏不是授权；staff 调用 `get_my_code_inventory` 必须由服务端在读取 Vault 前以 `FORBIDDEN` 拒绝，该拒绝异常不承诺审计落库，其他 Admin RPC 继续独立鉴权。
6. 既有 `admin_checkin_overview` 与 `checkin_sync` Admin 直读策略必须同时限定有效 `role = 'admin'` 的认证主体，防止 staff 借历史白名单策略读取体验官记录。
7. 员工分配沿用 `staff-role-permissions-v1.md` 的非阻断软容量口径：超过 5 名教练或 150 名当前体验官仍允许成功，返回 `STAFF_CAPACITY_WARNING`、在 Admin 显示红字并追加容量警告与治理跟进审计，不得将其实现为硬限制。

## 双路径激活唯一终审与来源审计（TASK-10.13 增量）

1. `code_activations.request_source` 为必填且不可变的 `manual_code / coach_push`，分别只能由 `request_box_code_activation` 与 `coach_push_code_v1` 写入；两条路径的 `CodeActivationRequested` 事件 metadata 同步保存 `requestSource`。历史行按请求事件的 actor 与申请人是否一致回填，无该事件的 10.9 前自助申请归为 `manual_code`。回填仅在同一事务内临时禁用真实 `code_activation_mutation_guard`，完成后立即恢复，不递增存量 `version`；异常由事务整体回滚，随后启用的来源不可变守护不受影响。
2. 两条 pending 申请仍只经 `admin_review_box_code_activation_v2` 公开终审；其内部复用既有 `admin_review_box_code_activation` 原子事务，继续强制有效 Admin、目标教练与码归属一致、码和申请双版本匹配。旧 `activate_box_code(text,text)` 与 `activate_box_code(text,integer,integer,text)` 必须删除，原审核函数对浏览器角色回收执行权限，禁止形成第二终审或自助激活路径。
3. 两入口在读取 `box_code_commands` 前按同一幂等键获取事务级咨询锁，串行化并发首写；同键同载荷返回首次结果并标记 `replayed=true`，同键异载荷返回 `IDEMPOTENCY_CONFLICT`，不得创建第二条申请。既有码行锁、状态冲突与终审乐观版本语义保持不变。
4. staff 调用 `coach_push_code_v1` 必须先以可提交的 JSON `FORBIDDEN` 结果返回并追加 `staff_rbac_audit`；其他调用者随后必须具有有效 `camp_admins.role = 'coach' AND is_active`，停用 coach 即使保留关系和库存也在 Vault 与目标读取前返回 `FORBIDDEN`。有效教练只能使用本人云库存 unused 码及本人当前营员关系。两入口均从 Vault `box_code_pepper` 读取密钥，缺失错误码为 `BOX_CODE_PEPPER_NOT_CONFIGURED`，不得回退 GUC。
5. 既有终审 `audit_logs` 在插入时由数据库触发器从申请行补充 `requestSource`，通过和拒绝均保留来源；不得在终审函数之外另写激活、归属或库存状态。
## 教练身份 SSOT 与 Pepper Vault（TASK-10.13 增量）

1. **唯一身份来源**：`camp_admins` 中 `role = 'coach' AND is_active AND auth_user_id IS NOT NULL` 是“谁是教练”的唯一事实源；`user_coach_relation` 只回答“谁名下有哪些当前营员”。目录、划拨、staff 分配、审核、补货、雷达、权限档案、云库存、营员列表、跟进与直推不得再以当前学员数或 `auth.users` 存在代替教练身份。
2. **受控写入**：`admin_set_coach_role(p_email, p_is_active, p_expected_version, p_idempotency_key)` 仅有效 Admin 可调用。新建要求版本 0，已有行必须精确匹配版本；同一幂等键、命令类型、载荷与调用者可重放原结果，异载荷或异调用者返回 `IDEMPOTENCY_CONFLICT`。创建、变更、停用均递增版本并写成功审计；已有 admin/staff 行或其他认证主体占用行返回 `ROLE_ASSIGNMENT_CONFLICT`，不得降成 coach。
3. **存量安全回填**：迁移为当前有效关系中的教练创建或同步有效 coach 角色行，已有停用 coach 行恢复有效，保证存量教练不断权；已有 admin/staff 角色行保持不变，认证主体或规范化邮箱被其他角色占用时跳过，不自动降权或抢占身份。`SystemConfig.platform_official_account_id` 指向的平台官方账号即使持有当前归属关系，也不得被回填为 coach。
4. **空盘教练**：没有当前营员的新教练仍可被 Admin 目录搜索、staff 分配、码池划拨、审核选择与补货申请，并可读取本人 `get_my_access_profile`、空雷达和空云库存。`admin_get_coach_directory` 联系方式仍仅向有效 Admin 返回；普通用户、coach、staff 均不能枚举该目录。
5. **最小权限**：coach 只能读取或操作本人当前营员、本人库存与本人跟进；staff 继续只读当前有效分配范围内的五字段雷达，不能读取教练目录或云库存。staff 的云库存 `FORBIDDEN` 拒绝不得写入随后必然回滚的 `staff_finance_denied` 审计；只有成功 RBAC 变更才审计。角色停用后，新请求立即失去 coach 能力，但历史归属、激活与审计事实不改写。
6. **Vault 全链路收口**：所有最新生效且需要 `box_code_pepper` 的 RPC 必须从 `vault.decrypted_secrets` 按 `name = 'box_code_pepper'` 读取，不再读取 `current_setting('app.box_code_pepper')`。覆盖生成、手动申请、旧激活函数、待审列表、审核补发、云库存与教练直推；密钥缺失或为空时统一抛出或返回 `BOX_CODE_PEPPER_NOT_CONFIGURED`，不得回退 GUC 或泄露密钥。保留各函数原签名、事务边界、授权状态与业务语义。

## 教练身份 SSOT 与 Pepper Vault（TASK-10.13 增量）

1. **唯一身份来源**：`camp_admins` 中 `role = 'coach' AND is_active AND auth_user_id IS NOT NULL` 是“谁是教练”的唯一事实源；`user_coach_relation` 只回答“谁名下有哪些当前营员”。目录、划拨、staff 分配、审核、补货、雷达、权限档案、云库存、营员列表、跟进与直推不得再以当前学员数或 `auth.users` 存在代替教练身份。
2. **受控写入**：`admin_set_coach_role(p_email, p_is_active, p_expected_version, p_idempotency_key)` 仅有效 Admin 可调用。新建要求版本 0，已有行必须精确匹配版本；同一幂等键、命令类型、载荷与调用者可重放原结果，异载荷或异调用者返回 `IDEMPOTENCY_CONFLICT`。创建、变更、停用均递增版本并写成功审计；已有 admin/staff 行或其他认证主体占用行返回 `ROLE_ASSIGNMENT_CONFLICT`，不得降成 coach。
3. **存量安全回填**：迁移为当前有效关系中的教练创建或同步有效 coach 角色行，已有停用 coach 行恢复有效，保证存量教练不断权；已有 admin/staff 角色行保持不变，认证主体或规范化邮箱被其他角色占用时跳过，不自动降权或抢占身份。`SystemConfig.platform_official_account_id` 指向的平台官方账号即使持有当前归属关系，也不得被回填为 coach。
4. **空盘教练**：没有当前营员的新教练仍可被 Admin 目录搜索、staff 分配、码池划拨、审核选择与补货申请，并可读取本人 `get_my_access_profile`、空雷达和空云库存。`admin_get_coach_directory` 联系方式仍仅向有效 Admin 返回；普通用户、coach、staff 均不能枚举该目录。
5. **最小权限**：coach 只能读取或操作本人当前营员、本人库存与本人跟进；staff 继续只读当前有效分配范围内的五字段雷达，不能读取教练目录或云库存。staff 的云库存 `FORBIDDEN` 拒绝不得写入随后必然回滚的 `staff_finance_denied` 审计；只有成功 RBAC 变更才审计。角色停用后，新请求立即失去 coach 能力，但历史归属、激活与审计事实不改写。
6. **Vault 全链路收口**：所有最新生效且需要 `box_code_pepper` 的 RPC 必须从 `vault.decrypted_secrets` 按 `name = 'box_code_pepper'` 读取，不再读取 `current_setting('app.box_code_pepper')`。覆盖生成、手动申请、旧激活函数、待审列表、审核补发、云库存与教练直推；密钥缺失或为空时统一抛出或返回 `BOX_CODE_PEPPER_NOT_CONFIGURED`，不得回退 GUC 或泄露密钥。保留各函数原签名、事务边界、授权状态与业务语义。

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
