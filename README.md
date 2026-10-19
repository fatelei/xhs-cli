# 小红书创作平台 CLI

基于 2026-10-14 实际网页与前端资源实现的浏览器会话版 CLI。已用真实登录账号验证笔记查询、单篇统计、账号统计，以及文字卡片、视频、长文和播客的发布前预览。**没有提交测试帖子，真实发布成功尚未验收。**

从源码运行需要 Node.js 22+、项目依赖和 Google Chrome；GitHub Release 提供不需要单独安装 Node.js 的平台可执行文件，但仍需要 Google Chrome：

```bash
npm ci
node bin/xhs.js --help
```

从 Release 下载对应系统的 `xhs-*` 文件后，可直接运行：

```bash
./xhs-macos-arm64 --help
```

首次使用前需安装 Google Chrome，并在 macOS/Linux 上给下载文件添加执行权限（`chmod +x xhs-*`）。

从源码运行：

```bash
cd /Users/fatelei/github/xhs-cli
node bin/xhs.js login
node bin/xhs.js notes --pages 3 > notes.json
node bin/xhs.js stats 你的24位笔记ID > stats.json
node bin/xhs.js account > account.json
```

`login` 会打开独立 Chrome，在其中手动登录。默认会话保存在 `~/.xhs-cli/browser`，目录权限 0700；不要共享此目录。也可通过 `--profile DIR` 分开账号，或通过 `--cdp http://127.0.0.1:9222` 连接自己已开启调试的本机 Chrome。命令会创建专用标签页，运行结束关闭该标签页。

查询、评论与发布默认使用**无头 Chrome**，执行时不显示窗口，继续复用原有登录会话；登录过期时执行 `xhs login` 或 `xhs login --site web`，扫码登录后再运行命令。加 `--headed` 可显示窗口调试，`--headless` 可显式指定无头模式。交互式 `login` 始终显示窗口，不接受 `--headless`。使用 `--cdp` 时保留外部浏览器已有的显示模式，CLI 不会把已打开的窗口转换成无头浏览器。

## 发布

```bash
# 图文：可重复 --image；默认只填表预览
node bin/xhs.js publish --title '今天的记录' --body '正文' --image ./a.jpg --image ./b.jpg

# 视频：浏览器负责上传、转码、封面等平台流程
node bin/xhs.js publish --title '视频记录' --body-file ./body.txt --video ./clip.mp4

# 文字：本地排成 PNG 卡片，再按图文发布；不是原生纯文字接口
node bin/xhs.js publish --title '随手记' --body-file ./body.txt --type text

# 长文：自动编辑、一键排版，再进入发布页
node bin/xhs.js publish --title '一篇长文' --body-file ./article.txt --type article

# 播客：10分钟至2小时，最大1GB，必须提供封面
xhs publish --title '我的播客' --body '本期介绍' --audio ./episode.mp3 --cover ./cover.jpg --timeout 180

# 真正点击发布，显式追加 --submit
node bin/xhs.js publish --title '今天的记录' --body '正文' --image ./a.jpg --submit
```

无头模式下，发布默认填表后保存PNG截图并退出，JSON中的 `preview_path` 为截图绝对路径，不会点击发布。默认保存至当前目录 `exports/previews/`，可用 `--preview ./preview.png` 指定路径；截图文件权限0600。`--headed` 且不指定 `--preview` 时保留交互预览，查看窗口后按 Enter 结束。预览会触发平台自身的草稿保存。

`--submit` 才真正点击发布，必须检测到“发布成功”才报告成功；超时后应先查看笔记管理，避免重复提交。程序不会自动重试发布。普通正文最多1000字、图文最多18张；长文先编辑与排版成图，再进入发布页。话题、定时发布、合集、可见范围目前需要网页手动设置。平台发布按钮位于封闭 Shadow DOM，CLI 用 CDP 定位并点击真实按钮。

## 评论正文

```bash
# 创作平台与主站登录态分开；完整评论需要主站登录
xhs login --site web

# 每次命令只读取一页；使用带 xsec_token 的笔记链接
xhs comments 'https://www.xiaohongshu.com/explore/笔记ID?xsec_token=链接里的值' > page1.json

# 仅当你决定继续时，把上一页返回的 cursor 传入下一次调用
xhs comments 'https://www.xiaohongshu.com/explore/笔记ID?xsec_token=链接里的值' --cursor '下一页游标' > page2.json

# 回复分页也单独请求一页；使用根评论的 reply_cursor 和 id
xhs comments 'https://www.xiaohongshu.com/explore/笔记ID?xsec_token=链接里的值' --reply-cursor '回复游标' --root-comment-id '根评论ID' > replies.json
```

输出 `comments` 数组，每条包含 `id`、`content`（评论正文）、`user.id/nickname`、`create_time`（毫秒时间戳）、`like_count`、`reply_to_id`、`reply_cursor` 和 `replies`。每次命令只成功请求一页，并返回 `cursor`、`has_more`；使用者自行决定是否再次运行并传入 `--cursor`。续取回复时，一次只请求一个根评论的一页回复。续取命令需要提供带 `xsec_token` 的笔记链接，或 `--xsec-token`；CLI 不会自动翻找令牌、自动翻页或自动追加回复。续取时会拦截页面加载自动发出的首屏评论请求，再按提供的游标请求指定页。

`has_more` 表示当前分页类型仍有内容；`reply_cursor` 与 `replies_has_more` 用于单独续取某条根评论的回复。`complete` 仅描述当前这一页的响应，不表示整篇笔记已全部读取。无主站登录态时不能续取受限分页。界面评论总数可能包含楼中楼、删除或过滤内容，不能直接当成根评论条数。

## 数据和兼容性

`notes` 进入笔记管理的已发布页签，捕获应用本身触发的列表响应并对重复页去重；交互式终端中每加载下一页前需按 Enter，`--pages` 为最多尝试加载页数。非交互式运行只读取首屏。`stats` 进入单篇笔记详情，`account` 进入账号统计页，捕获对应的数据响应。输出 `{records:[{path,data}],errors:[]}`，保留原始字段，权限拒绝会记录为错误，不转换成零值。已核实单篇返回曝光、浏览、点赞、收藏、评论、分享、涨粉、点击率及受众数据，账号返回7天/30天数据。不同笔记类型和账号权限可能返回不同字段。

浏览器自动化适配会受网页结构、按钮名称和账号权限变化影响；没有抓到有效响应时明确报错。并发使用同一个持久化 Chrome profile 会冲突。脚本没有复制 Cookie 到配置文件，也没有硬编码平台签名算法。

当前账号已确认开放图文、视频、长文、播客。文字输入会在本地生成图片后按图文上传。`xhs types` 查看各类型状态。

## 验证

```bash
npm test
node bin/xhs.js --help
```

16项单元测试已通过，覆盖无头模式选择、截图预览、参数校验、评论与回复分页去重、部分结果保留、登录身份校验、媒体互斥、响应来源过滤与封闭 Shadow DOM 定位。`scripts/check-headless.mjs` 已验证实际 HeadlessChrome 运行模式和真实 PNG 生成；默认无头的笔记、评论查询已通过真实账号验证。`scripts/check-footer.mjs` 在本地空白页面验证了发布按钮禁用保护和真实鼠标点击。`scripts/check-flows.mjs` 为维护用联调脚本，会上传临时素材并产生未发布草稿，不属于普通测试命令。

逆向证据与未完成事项见 [研究记录](work/20261014-xhs/report.md)。
