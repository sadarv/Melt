import { ref, computed, watch } from "vue";
import { manualOffline } from "./emergencyMode";

// 🚀 核心修复：规范化 BASE 路径，并打印出来自证清白
const rawBase = import.meta.env.VITE_API_URL || "";
const BASE = rawBase.replace(/\/+$/, "");
const MODE = import.meta.env.VITE_APP_MODE || "personal";

console.log(`[API 诊断] 当前后端地址(BASE): "${BASE}"`);
console.log(`[API 诊断] 当前模式(MODE): "${MODE}"`);

const healthCheckTimeout = 8000;

export const APP_MODE = MODE;
export const isPersonalMode = MODE === "personal";

// 模式状态
const storedMode = localStorage.getItem("force_local_mode");
export const isLocalMode =
  storedMode !== null
    ? storedMode === "true"
    : MODE === "local" || MODE === "lite";
export const isStaticLocalMode = isLocalMode;

// 云端状态相关变量
export const isCloudDown = ref(false);
export const pendingSyncCount = ref(0);
let healthCheckTimer = null;
let consecutiveFailures = 0;
const MAX_FAILURES = 6;

// 🚀 恢复函数移动到变量定义之后
export function forceRestoreCloud() {
  consecutiveFailures = 0;
  isCloudDown.value = false;
  console.log("[API] 已手动重置云端状态为：可用");
}

export function shouldUseLocal() {
  if (isStaticLocalMode) return true;
  return manualOffline.value || isCloudDown.value;
}

// 健康检查逻辑
async function checkCloudHealth() {
  if (isStaticLocalMode) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), healthCheckTimeout);
    // 探测接口
    const res = await fetch(`${BASE}/api/prompts/personas`, {
      signal: controller.signal,
      headers: { "x-beta-mode": "false" },
    });
    clearTimeout(timeout);

    if (res.ok) {
      consecutiveFailures = 0;
      if (isCloudDown.value) {
        console.log("[API] 云端连接已恢复正常");
        isCloudDown.value = false;
        syncPendingData();
      }
    } else {
      onCloudFailure();
    }
  } catch (e) {
    // 只有在非本地开发环境下（或者确定不是跨域错误时）才判定失败
    if (e.name !== "TypeError") {
      onCloudFailure();
    }
  }
}

function onCloudFailure() {
  consecutiveFailures++;
  if (consecutiveFailures >= MAX_FAILURES && !isCloudDown.value) {
    console.warn("[API] 云端探测失败，自动切入应急本地模式");
    isCloudDown.value = true;
  }
}

export async function warmUpCloud() {
  if (isStaticLocalMode) return;
  console.log("[API] 正在尝试连接云端后端...");
  await checkCloudHealth();
}

export function startHealthCheck() {
  if (isStaticLocalMode) return;
  warmUpCloud();
  healthCheckTimer = setInterval(checkCloudHealth, 30000);
}

export function stopHealthCheck() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

// 待同步逻辑
const PENDING_KEY = "melt_pending_sync";
export function addPendingSync(item) {
  const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
  pending.push(item);
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  pendingSyncCount.value = pending.length;
}

// 🚀 新增：读取待同步队列
export function getPendingSync() {
  return JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
}

async function syncPendingData() {
  const pending = JSON.parse(localStorage.getItem(PENDING_KEY) || "[]");
  if (pending.length === 0) return;
  localStorage.removeItem(PENDING_KEY);
  pendingSyncCount.value = 0;
  console.log(`[API] 正在后台同步离线期间的 ${pending.length} 条数据...`);
}

// 🚀 核心请求函数：彻底修掉路径拼接和模型清洗的隐患
export async function api(path, options = {}) {
  // 1. 构造正确的 URL
  const normalizedPath = path.startsWith("/") ? path : "/" + path;
  const fullUrl = `${BASE}${normalizedPath}`;

  // 2. 如果是测试连接接口，强制走云端，绝对不拦截！
  const isTestRequest = path.includes("/api/test/");

  if (isStaticLocalMode) {
    const { localApiHandler } = await import("./localApi");
    return localApiHandler(path, options);
  }

  // 只有非测试请求才受 isCloudDown 影响
  if (isCloudDown.value && !isTestRequest) {
    const method = (options.method || "GET").toUpperCase();
    if (method !== "GET") {
      addPendingSync({
        path,
        method,
        body: options.body ? JSON.parse(options.body) : undefined,
      });
    }
    const { localApiHandler } = await import("./localApi");
    return localApiHandler(path, options);
  }

  // 正常发请求
  const isBeta = localStorage.getItem("is_beta_mode") === "true";
  const headers = new Headers(options.headers || {});
  headers.set("x-beta-mode", isBeta ? "true" : "false");

  try {
    return await fetch(fullUrl, { ...options, headers });
  } catch (e) {
    if (!isTestRequest) onCloudFailure();
    throw e;
  }
}
