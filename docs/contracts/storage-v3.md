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
- `DayRecord` 字段：`weight: string`、`waist: string`、`meals: boolean[3]`、`water: boolean`、`movement: boolean`、`sleep: boolean`。
- `meals` 顺序固定为早餐、午餐、晚餐；长度必须为 3。
- 体重或腰围非空，或任一行为项为 `true`，即视为有内容。CSV 只导出有内容记录。

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
- 新代码优先使用 `crypto.getRandomValues`；不可用时回退到 `Math.random`。
- 代码仅用于本机记录、海报和 CSV 汇总，不代表登录身份，不上传服务器。
- 海报署名另存于 `junheng-checkin-name-v1`，不属于 v3 顶层结构。

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
