# 一克之差的字体子集

只含游戏里用到的字，按 SIL Open Font License 1.1 分发，许可证原文在同目录的两个 OFL 文件里，字体文件的 name 表也保留了版权与许可信息。

| 文件 | 来源 | 用在 |
| --- | --- | --- |
| `yike-brush.woff2` | Ma Shan Zheng Regular（google/fonts `ofl/mashanzheng`） | 标题「一克之差」、弹窗标题、「齐」字章 |
| `yike-serif-700.woff2` | Noto Serif SC 可变字体取 wght 700（google/fonts `ofl/notoserifsc`） | 关卡、道具名、秤下说明、弹窗按钮 |
| `yike-serif-900.woff2` | 同上取 wght 900 | 砝码与药包重量、飘字、弹窗大字与统计 |

游戏里这几处的文字改了、多出没收进来的字时，那几个字退回系统字体，要按下面重做子集：

```sh
# fonttools 4.60.1 + brotli；字表 = 游戏里用到的字，数字与 g ? / + 空格两套宋体都带上
fonttools subset MaShanZheng-Regular.ttf --text='一克之差暂存台堆满了这几包凑不齐抓' --flavor=woff2 --no-hinting --desubroutinize --name-IDs='*' --output-file=yike-brush.woff2
fonttools varLib.instancer 'NotoSerifSC[wght].ttf' wght=700 -o serif700.ttf
fonttools subset serif700.ttf --text='第关撤回透视换方子这抓齐了要称还差平超暂存台加格接着再来一次下开始药！，· 0123456789g?/+' --flavor=woff2 --no-hinting --desubroutinize --name-IDs='*' --output-file=yike-serif-700.woff2
fonttools varLib.instancer 'NotoSerifSC[wght].ttf' wght=900 -o serif900.ttf
fonttools subset serif900.ttf --text='平方差第台秤只就了还有张子没称！· 0123456789g?/+' --flavor=woff2 --no-hinting --desubroutinize --name-IDs='*' --output-file=yike-serif-900.woff2
```
