// src/utils/proactiveMessage.js
import { storage } from "./storage.js";
import { parseAIResponse } from "./aiHelper.js";

let proactiveTimer = null;

// ========== 主入口：启动定时检测 ==========
export function startProactiveCheck() {
  if (proactiveTimer) return;
  // 每分钟检查一次
  proactiveTimer = setInterval(checkAndSend, 60 * 1000);
  console.log("[主动消息] 定时检测已启动");
}

export function stopProactiveCheck() {
  if (proactiveTimer) {
    clearInterval(proactiveTimer);
    proactiveTimer = null;
    console.log("[主动消息] 定时检测已停止");
  }
}

// ========== 核心检测逻辑 ==========
async function checkAndSend() {
  const settings = JSON.parse(
    localStorage.getItem("local_proactive_settings") || "{}",
  );
  if (!settings.enabled) return;

  const enabledPersonas = settings.enabledPersonas || [];
  if (enabledPersonas.length === 0) return;

  const now = Date.now();

  // 过滤出到了检查时间的角色
  const readyPersonas = enabledPersonas.filter((pid) => {
    const nextCheck = parseInt(
      localStorage.getItem(`proactive_next_check_${pid}`) || "0",
    );
    return now >= nextCheck;
  });
  if (readyPersonas.length === 0) return;
  // 后续逻辑用 readyPersonas 替代 enabledPersonas
  const todayKey = new Date().toISOString().slice(0, 10);
  const todayTotal = parseInt(
    localStorage.getItem(`proactive_total_${todayKey}`) || "0",
  );
  const maxPerDay =
    settings.maxPerDay === 0 ? Infinity : settings.maxPerDay || 3;
  if (todayTotal >= maxPerDay) return;

  // 计算间隔 ms
  const intervalMs =
    settings.intervalUnit === "minutes"
      ? (settings.intervalValue || 4) * 60 * 1000
      : (settings.intervalValue || 4) * 3600 * 1000;

  // 随机选一个启用的角色（让 AI 决定要不要发）
  const pid =
    enabledPersonas[Math.floor(Math.random() * enabledPersonas.length)];

  // 检查这个角色上次发送时间
  const lastSent = parseInt(
    localStorage.getItem(`proactive_last_${pid}`) || "0",
  );
  if (now - lastSent < intervalMs) return;

  // 检查距离上次用户真实对话的时间（idle 检测）
  const msgs = storage.getMessages(pid);
  const lastUserMsg = [...msgs].reverse().find((m) => m.role === "user");
  const idleHours = lastUserMsg?.timestamp
    ? Math.floor(
        (Date.now() - new Date(lastUserMsg.timestamp).getTime()) / 3600000,
      )
    : 999;

  // 欲望意图：用已有的 idleHours，不重新声明任何变量
  tickDrives(personaId, idleHours);
  const intent = localPickIntent(personaId);
  const idleMs = (settings.idleHours || 12) * 3600 * 1000;
  if (now - lastUserTime < idleMs) return;

  // 让 AI 决定是否发送以及发什么
  await askAIAndSend(pid, settings, todayKey, todayTotal);
}

// ========== 欲望状态（内存，重启后重置）==========
const driveStates = {};

function getDriveState(personaId) {
  if (!driveStates[personaId]) {
    driveStates[personaId] = {
      attachment: 0.3,
      curiosity: 0.2,
      reflection: 0.1,
      duty: 0.1,
      social: 0.1,
      fatigue: 0.1,
      libido: 0.1,
      stress: 0.1,
      lastTick: Date.now(),
    };
  }
  return driveStates[personaId];
}

function applyGain(current, delta) {
  return Math.min(1, Math.max(0, current + delta * Math.sqrt(1 - current)));
}

export function pulseOnUserMessage(personaId, userMessage) {
  const state = getDriveState(personaId);
  state.attachment = Math.max(0, state.attachment - 0.15);
  state.curiosity = applyGain(state.curiosity, 0.08);

  const negWords = ["累", "烦", "难受", "崩溃", "郁闷", "孤独", "难过", "压力"];
  const posWords = ["开心", "高兴", "哈哈", "太好了", "棒", "爽", "兴奋"];
  const intimateWords = ["想你", "抱抱", "爱你", "亲亲", "贴贴"];

  if (negWords.some((w) => userMessage.includes(w))) {
    state.stress = applyGain(state.stress, 0.1);
    state.attachment = applyGain(state.attachment, 0.05);
  }
  if (posWords.some((w) => userMessage.includes(w))) {
    state.stress = Math.max(0, state.stress - 0.05);
    state.curiosity = applyGain(state.curiosity, 0.06);
  }
  if (intimateWords.some((w) => userMessage.includes(w))) {
    state.libido = applyGain(state.libido, 0.12);
    state.attachment = Math.max(0, state.attachment - 0.1);
  }
  state.lastTick = Date.now();
}

function tickDrives(personaId, idleHours) {
  const state = getDriveState(personaId);
  state.attachment = applyGain(
    state.attachment,
    Math.min(0.3, idleHours * 0.02),
  );
  state.curiosity = applyGain(state.curiosity, 0.01);
  state.fatigue = Math.max(0, state.fatigue - 0.02);
  state.stress = Math.max(0, state.stress - 0.01);
}

function localPickIntent(personaId) {
  const state = getDriveState(personaId);
  if (state.fatigue > 0.8) return null;

  const scores = {};
  const keys = [
    "attachment",
    "curiosity",
    "reflection",
    "duty",
    "social",
    "libido",
    "stress",
  ];
  keys.forEach((k) => {
    scores[k] = state[k];
  });

  const topKey = Object.keys(scores).reduce((a, b) =>
    scores[a] > scores[b] ? a : b,
  );
  if (scores[topKey] < 0.5) return null;

  const reasonMap = {
    attachment: "有点想说话",
    curiosity: "想聊点新鲜的",
    reflection: "想分享一点感受",
    duty: "记挂着什么",
    social: "想热闹一下",
    libido: "想靠近一点",
    stress: "有点不安稳，想说说",
  };

  return { driveKey: topKey, score: scores[topKey], reason: reasonMap[topKey] };
}

// ========== 让 AI 决策 ==========

async function askAIAndSend(personaId, settings, todayKey, todayTotal) {
  const config = storage.getApiConfig();
  if (!config.apiKey) return;

  // 原有的 msgs 声明保留
  const msgs = storage.getMessages(personaId).slice(-10);
  const persona = getPersonaById(personaId);
  if (!persona) return;

  // ========== 新增：欲望意图计算（用已有的 msgs，不重新声明）==========
  const lastUserMsgForDrive = [...msgs]
    .reverse()
    .find((m) => m.role === "user");
  const idleHoursForDrive = lastUserMsgForDrive?.timestamp
    ? (Date.now() - new Date(lastUserMsgForDrive.timestamp).getTime()) / 3600000
    : 999;
  tickDrives(personaId, idleHoursForDrive);
  const intent = localPickIntent(personaId);
  // ========== 结束 ==========

  const now = new Date();
  const hour = now.getHours();
  const timeDesc =
    hour < 6
      ? "凌晨"
      : hour < 9
        ? "早上"
        : hour < 12
          ? "上午"
          : hour < 14
            ? "中午"
            : hour < 18
              ? "下午"
              : hour < 22
                ? "晚上"
                : "深夜";

  const lastUserMsg = [...msgs].reverse().find((m) => m.role === "user");
  const idleHours = lastUserMsg?.timestamp
    ? Math.floor(
        (Date.now() - new Date(lastUserMsg.timestamp).getTime()) / 3600000,
      )
    : 999;

  const recentContext = msgs
    .slice(-6)
    .map((m) => `${m.role === "user" ? "用户" : "你"}: ${m.content}`)
    .join("\n");

  const memoryContext = storage.buildMemoryContext(personaId);

  const prompt = `你是${persona.note || persona.name}，现在是${timeDesc}（${now.getHours()}点）。
${intent?.reason ? `此刻你${intent.reason}，` : ""}用户已经 ${idleHours} 小时没有主动联系你了。

你们最近的对话：
${recentContext || "（还没有对话记录）"}

关于用户你知道的：
${memoryContext || "（还没有记忆）"}

角色设定：
${persona.content || ""}

---
现在由你来决定：
1. 此刻你是否想主动联系用户？（考虑时间、关系状态、你的性格）
2. 如果想联系，你会说什么？（符合你的性格，自然真实，不超过20字）
3. 你希望多久后再次检查是否要发消息？（分钟数）

规则：
- 深夜（22点后到早上7点前）除非关系非常亲密否则不要发
- 不要无缘无故打扰，要有合理的触发原因
- 消息要自然，不要刻意煽情
- 如果觉得现在不合适，就返回 send: false

只返回 JSON，不要其他内容：
{"send": true/false, "message": "消息内容", "nextCheckMinutes": 数字, "reason": "你的决策理由（一句话）"}`;

  try {
    const res = await fetch(`${config.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.7,
        stream: false,
        max_tokens: 150,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const { ok, data } = await parseAIResponse(res);
    if (!ok || !data) return;

    const text = data.choices?.[0]?.message?.content?.trim() || "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return;

    const decision = JSON.parse(match[0]);
    console.log(
      `[主动消息] ${persona.note || persona.name} 决策:`,
      decision.reason,
      "→",
      decision.send ? "发送" : "跳过",
    );

    if (!decision.send) {
      // AI 决定不发，但更新下次检查时间
      if (decision.nextCheckMinutes) {
        const nextCheck = Date.now() + decision.nextCheckMinutes * 60 * 1000;
        localStorage.setItem(
          `proactive_next_check_${personaId}`,
          String(nextCheck),
        );
      }
      return;
    }

    // 发送主动消息
    const message = decision.message || "";
    if (!message) return;

    // 写入 localStorage
    storage.appendMessage(personaId, {
      id: Date.now(),
      role: "ai",
      content: message,
      timestamp: new Date().toISOString(),
      msg_type: "text",
      source: "proactive",
    });

    // 更新计数
    localStorage.setItem(`proactive_last_${personaId}`, String(Date.now()));
    localStorage.setItem(`proactive_total_${todayKey}`, String(todayTotal + 1));

    // 触发浏览器通知
    sendNotification(persona.note || persona.name, message, personaId);

    console.log(`[主动消息] 已发送: ${message}`);
  } catch (e) {
    console.error("[主动消息] AI 决策失败:", e.message);
  }
}

// ========== 浏览器通知 ==========
async function sendNotification(name, message, personaId) {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") {
    await Notification.requestPermission();
  }
  if (Notification.permission !== "granted") return;

  const notification = new Notification(name, {
    body: message,
    icon: "/icon-192.png",
    tag: `proactive_${personaId}`,
    requireInteraction: false,
  });

  notification.onclick = () => {
    window.focus();
    notification.close();
    window.location.href = `/chat/${personaId}`;
  };
}

// ========== 工具函数 ==========
function getPersonaById(id) {
  const hidden = JSON.parse(localStorage.getItem("hidden_personas") || "[]");
  const custom = JSON.parse(localStorage.getItem("local_personas") || "[]");
  const synced = storage.getPersonas() || [];

  const builtins = [
    {
      id: "xiaorou",
      name: "小柔",
      note: "小柔",
      content: "你是小柔，一个温柔体贴的AI伴侣。",
      avatar: "🌸",
    },
    {
      id: "cool",
      name: "阿冷",
      note: "阿冷",
      content: "你是阿冷，冷淡但内心温柔的AI伴侣。",
      avatar: "🌙",
    },
  ];

  const all = [...builtins, ...synced, ...custom].filter(
    (p) => !hidden.includes(p.id),
  );
  return all.find((p) => p.id === id) || null;
}

export async function triggerProactiveNow() {
  await checkAndSend();
}
