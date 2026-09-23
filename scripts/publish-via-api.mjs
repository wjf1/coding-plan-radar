// 通过 GitHub API 发布（适用于 github.com 的 HTTPS 被网络阻断、git push 不可用的环境）
//
// 用途：把当前目录的改动作为「一次原子提交」推到远端，等价于 git add -A && git commit && git push。
// 用法：
//   node scripts/publish-via-api.mjs "提交信息"
//   GITHUB_REPO=owner/repo node scripts/publish-via-api.mjs "提交信息"
//
// 依赖：Node ≥18；token 优先取环境变量 GITHUB_TOKEN，其次取 `gh auth token`（需已登录且对目标仓库有写权限）。
// 说明：走 api.github.com 的 Git Data API（blob → tree → commit → 更新 ref），
//       因此不需要 git 凭据，也不受 github.com 主站被阻断的影响（raw/api 域名通常仍可用）。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { execSync } from "node:child_process";

const ROOT = resolve(process.cwd());
const MESSAGE = process.argv[2] || `chore: 手动发布 ${new Date().toISOString().slice(0, 10)}`;
const REPO = process.env.GITHUB_REPO || "wjf1/coding-plan-radar";
const BRANCH = process.env.GITHUB_BRANCH || "main";

let TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  try {
    TOKEN = execSync("gh auth token", { encoding: "utf8" }).trim();
  } catch {
    console.error("✗ 未找到 GITHUB_TOKEN，且 `gh auth token` 不可用。请先设置 GITHUB_TOKEN 或运行 `gh auth login`。");
    process.exit(1);
  }
}

const API = `https://api.github.com/repos/${REPO}`;
const HEADERS = {
  authorization: `Bearer ${TOKEN}`,
  accept: "application/vnd.github+json",
  "user-agent": "coding-plan-radar-publish",
  "content-type": "application/json",
};

const api = async (path, opts = {}) => {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...HEADERS, ...(opts.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${opts.method || "GET"} ${path} → HTTP ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};

// 收集工作区文件（跳过版本控制与临时产物）
const SKIP = new Set([".git", "node_modules", ".DS_Store", "issue-body.md", ".log", ".tmp", ".swp", "~"]);
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(relative(ROOT, p).split(sep).join("/"));
  }
})(ROOT);
files.sort();
console.log(`目标仓库 ${REPO}@${BRANCH}，待发布 ${files.length} 个文件`);

const ref = await api(`/git/ref/heads/${BRANCH}`);
const baseCommitSha = ref.object.sha;
const base = await api(`/git/commits/${baseCommitSha}`);

const tree = [];
for (const f of files) {
  const blob = await api(`/git/blobs`, {
    method: "POST",
    body: JSON.stringify({ content: readFileSync(join(ROOT, f)).toString("base64"), encoding: "base64" }),
  });
  tree.push({ path: f, mode: "100644", type: "blob", sha: blob.sha });
}

const newTree = await api(`/git/trees`, {
  method: "POST",
  body: JSON.stringify({ base_tree: base.tree.sha, tree }),
});

if (newTree.sha === base.tree.sha) {
  console.log("内容与远端完全一致，无需提交");
  process.exit(0);
}

const commit = await api(`/git/commits`, {
  method: "POST",
  body: JSON.stringify({ message: MESSAGE, tree: newTree.sha, parents: [baseCommitSha] }),
});
await api(`/git/refs/heads/${BRANCH}`, {
  method: "PATCH",
  body: JSON.stringify({ sha: commit.sha, force: false }),
});

console.log(`✓ 已发布 ${commit.sha.slice(0, 8)} → ${REPO}@${BRANCH}`);
console.log(`  基线 ${baseCommitSha.slice(0, 8)} · ${base.message.split("\n")[0].slice(0, 70)}`);
