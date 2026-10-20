# 字体来源

| 文件 | 内容 | SHA-256 |
| --- | --- | --- |
| `Fredoka[wdth,wght].ttf` | Fredoka 2.001 可变字体原件，轴 wdth 75–125、wght 300–700 | `2ba02e68b152868aef9ba28e24b3648c7d457fe6f25c761f2c2c53fb61a73fc8` |
| `fredoka-latin.woff2` | 网页用子集：wdth 固定 100，wght 400–700，只含拉丁字符，27,436 字节 | `0c5d1f699905114a7965caf317e545516a86872a94b3cc71c3957a4f2fe71c34` |
| `OFL.txt` | SIL Open Font License 1.1 | — |

- 上游：https://github.com/google/fonts ，提交 `a60a77e14f28abd4ef243a1b5dfc48df0cec5205`，路径 `ofl/fredoka/`。
- 许可：OFL 1.1，允许商用、嵌入网页和再分发；子集保留原字体名，OFL 允许这种做法，因为字体没有声明保留字体名。
- 用途：品牌字标与界面展示字阶（`display` 字体族）。中文不在子集里，由 `fonts.css` 的 `unicode-range` 交给 PingFang SC 等系统中文字体。
- 字标 SVG 由 `assets/logo/build-logo.py` 直接读原件生成，网页不需要再加载字体。

重新生成子集（在 `brand/fonts/` 下，需要 fonttools 与 brotli）：

```bash
fonttools varLib.instancer "Fredoka[wdth,wght].ttf" wdth=100 wght=400:700 -o fredoka-inst.ttf
pyftsubset fredoka-inst.ttf --unicodes="U+0020-007E,U+00A0-00B6,U+00B8-00FF,U+2013,U+20AC,U+2122" \
  --layout-features="kern,liga,ccmp,mark,mkmk" --flavor=woff2 --output-file=fredoka-latin.woff2
rm fredoka-inst.ttf
```

实例化这一步每次运行会写入新的时间戳，产出的字节和入库文件不同；子集这一步对同一个实例文件可以逐字节复现。改了子集后要同步复制到 `public/brand/fonts/`，`scripts/check.mjs` 会核对两边一致。
