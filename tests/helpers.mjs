// 测试夹具：本仓库零依赖、无构建，浏览器脚本里的全局量只能靠 vm 求值取出来。
// 这个文件必须放在 helpers.mjs 而不是 *.test.mjs —— 后者会被测试运行器当成用例再跑一遍。
import fs from "node:fs";
import vm from "node:vm";

export function loadGlobal(file, expr) {
  const ctx = { console, Date, Math, JSON, String, Number, Array, Set, isNaN, RegExp };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file, "utf8") + `\nglobalThis.__OUT = ${expr};`, ctx);
  return ctx.__OUT;
}

export const loadPlans = () => loadGlobal("js/data.js", "PLAN_DATA");

/**
 * vm 里 new 出来的对象带的是另一个 realm 的 Object.prototype，与宿主字面量做
 * assert.deepEqual（strict 版会比较原型）时，即使结构完全一致也会失败。
 * 从 vm 取回的纯数据先过一道 structuredClone，就在宿主 realm 里重建了。
 */
export const hostData = (v) => structuredClone(v);
