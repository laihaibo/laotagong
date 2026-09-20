const { execFileSync } = require("child_process");
const fs = require("fs");
const https = require("https");
const path = require("path");
const root = "D:/XiaomiMiMoProjects/laotagong";
const nm = path.join(root, "node_modules");
const TAR = "C:\\Windows\\System32\\tar.exe";

function getJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Accept: "application/json", "User-Agent": "node" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return getJson(res.headers.location).then(resolve, reject);
      }
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => (res.statusCode === 200 ? resolve(JSON.parse(d)) : reject(new Error(url + " " + res.statusCode))));
    }).on("error", reject);
  });
}
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const f = fs.createWriteStream(dest);
    https.get(url, { headers: { "User-Agent": "node" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        f.close(); try { fs.unlinkSync(dest); } catch {}
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) return reject(new Error("status " + res.statusCode));
      res.pipe(f); f.on("finish", () => f.close(resolve));
    }).on("error", reject);
  });
}
async function installExact(name, version) {
  const dest = path.join(nm, ...name.split("/"));
  console.log(">>", name + "@" + version);
  const meta = await getJson("https://registry.npmjs.org/" + name + "/" + version);
  const tmp = path.join(root, ".tmp-g6.tgz");
  await download(meta.dist.tarball, tmp);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  execFileSync(TAR, ["-xzf", tmp, "-C", dest, "--strip-components=1"], { stdio: "pipe" });
  fs.unlinkSync(tmp);
  return JSON.parse(fs.readFileSync(path.join(dest, "package.json"), "utf8"));
}
(async () => {
  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.dependencies["@antv/g6"] = "^5.0.0";
  pkg.dependencies = Object.fromEntries(Object.entries(pkg.dependencies).sort());
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  const g6 = await installExact("@antv/g6", "5.0.49");
  console.log("g6 deps", Object.keys(g6.dependencies || {}).length);
  for (const [n, r] of Object.entries(g6.dependencies || {})) {
    if (n.startsWith("@types/")) continue;
    const dest = path.join(nm, ...n.split("/"), "package.json");
    if (fs.existsSync(dest)) { console.log("skip", n); continue; }
    let ver = r;
    if (/^[\^~]/.test(r) || r === "*") {
      try {
        const meta = await getJson("https://registry.npmjs.org/" + n);
        const major = r.replace(/^[\^~]/, "").split(".")[0];
        const vs = Object.keys(meta.versions).filter((v) => !v.includes("-") && (!/^\d+$/.test(major) || v.startsWith(major + ".")));
        ver = vs[vs.length - 1] || meta["dist-tags"].latest;
      } catch (e) { console.log("resolve fail", n, e.message); continue; }
    }
    try { await installExact(n, ver); } catch (e) { console.log("fail", n, e.message); }
  }
  console.log("DONE g6", fs.existsSync(path.join(nm, "@antv/g6/package.json")));
})();
