// itch.io 업로드용 zip 만들기: npm run pack:itch → release/shatter-stamp-itch.zip
// - ITCH=1 로 빌드해 itch가 게임 페이지에 넣는 도우미 스크립트(static.itch.io)를 보안 정책(CSP)에서 허용한다.
// - zip 안 경로는 반드시 "/"로 쓴다. Windows 기본 압축(Compress-Archive)은 "\"를 써서 itch에서 파일을 못 찾는다(404).
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

execSync("npm run build", { stdio: "inherit", env: { ...process.env, ITCH: "1" } });

const root = "dist";
const files: string[] = [];
(function walk(dir: string) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else files.push(path.relative(root, p).split(path.sep).join("/"));
  }
})(root);

const locals: Buffer[] = [], centrals: Buffer[] = [];
let offset = 0;
for (const name of files.sort()) {
  const data = fs.readFileSync(path.join(root, name));
  const packed = zlib.deflateRawSync(data, { level: 9 });
  const crc = zlib.crc32(data) >>> 0;
  const nameBuf = Buffer.from(name, "utf8");
  const head = Buffer.alloc(30);
  head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6); head.writeUInt16LE(8, 8);
  head.writeUInt32LE(crc, 14); head.writeUInt32LE(packed.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(nameBuf.length, 26);
  const cen = Buffer.alloc(46);
  cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
  cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(packed.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nameBuf.length, 28);
  cen.writeUInt32LE(offset, 42);
  locals.push(head, nameBuf, packed);
  centrals.push(cen, nameBuf);
  offset += head.length + nameBuf.length + packed.length;
}
const central = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
fs.mkdirSync("release", { recursive: true });
const out = "release/shatter-stamp-itch.zip";
fs.writeFileSync(out, Buffer.concat([...locals, central, end]));
console.log(`${out}: ${files.length} files`);
