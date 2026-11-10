"""웹용 한글 폰트 서브셋을 만든다.

Noto Sans KR 가변 폰트를 Bold(700)로 고정하고, ASCII 전체 + 게임에 쓰는 기호 + src/ 아래 .ts 파일에 나오는
비ASCII 글자(한글 문구)만 남겨 public/fonts/game_font.ttf로 저장한다. (전체 폰트는 수 MB라 용량을 줄이려는 것)
문구를 추가하거나 고치면 다시 실행한다. 안 그러면 새 글자가 시스템 글꼴로 대신 그려진다.

사용법: python tools/build-font.py <NotoSansKR[wght].ttf 경로>
원본: https://github.com/google/fonts/tree/main/ofl/notosanskr (SIL Open Font License 1.1)
필요: pip install fonttools
"""
import pathlib
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "fonts" / "game_font.ttf"


def main() -> None:
    src = sys.argv[1]
    chars = {chr(c) for c in range(0x20, 0x7F)} | set("▲▼·×…")
    for p in (ROOT / "src").rglob("*.ts"):
        chars |= {ch for ch in p.read_text(encoding="utf-8") if ord(ch) > 0x7F}
    font = TTFont(src)
    if "fvar" in font:
        font = instancer.instantiateVariableFont(font, {"wght": 700})
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    sub = subset.Subsetter(opts)
    sub.populate(text="".join(sorted(chars)))
    sub.subset(font)
    font.save(OUT)
    print(f"{len(chars)} chars -> {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
