# 素材出处清单

本目录不保存原始素材。网站仅保留 `apps/web/public/` 中已优化的展示文件；对外复用前仍需核验授权范围。

## 菌菇摄影

来源均为 Wikimedia Commons，源页格式为 `https://commons.wikimedia.org/wiki/File:<文件名>`。本地文件经居中裁切、缩放并转为 WebP；原始 JPG 不入库。

| 本地文件 | 源文件 | 作者 | 授权 |
| --- | --- | --- | --- |
| `mushrooms/hericium.webp` | `Hericium_erinaceus_104664221.jpg` | Becky | CC0 1.0 |
| `mushrooms/enoki.webp` | `Enoki_mushroom.jpg` | Mitrofresh | CC BY-SA（现有记录未注明版本） |
| `mushrooms/bamboo-fungus.webp` | `Phallus_indusiatus.jpg` | Jorge Ochoa | CC BY-SA（现有记录未注明版本） |
| `mushrooms/morel.webp` | `Morchella_esculenta_36771717.jpg` | Tom Zucker-Scharff | CC BY 4.0 |
| `mushrooms/reishi.webp` | `Ganoderma_lucidum_01.jpg` | Eric Steinert | CC BY-SA 3.0 |
| `mushrooms/cordyceps.webp` | `Cordyceps_Militaris.jpg` | mushroomclinicaltrials.com | CC BY 2.0 |
| `mushrooms/maitake.webp` | `Grifola_frondosa_2014_G1.jpg` | George Chernilevsky | Public domain |
| `mushrooms/truffle.webp` | `Tuber_melanosporum_-_trufa_negra,_Ágreda,_España.jpg` | Diego Delso | CC BY-SA 3.0 |

处理脚本：`apps/web/scripts/prepare-mushroom-images.py`。脚本引用的 `reference-assets/mushroom-sources/` 是外部原始素材目录，不属于本仓库。

## 品牌与业务素材

| 文件 | 当前记录 | 原始素材处理 |
| --- | --- | --- |
| `hero.webp`、`ingredients.webp`、`lifestyle.webp` | 项目现有品牌展示素材； 已复制源码 未记录更上游出处。 | 仅保留 Web 优化版；外部复用前向品牌方确认。 |
| `wechat-share.jpg` | 由 `apps/web/scripts/create_wechat_share.py` 基于 `hero.webp` 和品牌版式生成。 | 不另存生成中间件。 |
| `bmi-standard.png`、`waist-standard.png`、`clinical/ethics-approval.png` | 项目现有标准/临床说明图片； 已复制源码 未记录更上游出处。 | 仅保留 Web 展示版；外部复用前核验原始文件与授权。 |
| `favicon.svg` | 项目现有品牌界面资产。 | 无额外原始素材归档。 |

“未记录更上游出处”不是公共领域或许可声明；后续获得原始凭证时，应在此清单补充来源、作者、授权和日期，而不是提交大文件。
