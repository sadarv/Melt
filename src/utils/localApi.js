import { storage } from "./storage";
import { getSnapshot, buildFallbackSystemPrompt } from "./snapshotCache";
import { corePrompt } from "./corePrompt";
import { parseAIResponse } from "./aiHelper.js";
import { getOptimizedContext, markPersonaDirty } from "./contextCache.js";

function mockResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

// ========== 副 API 配置读取（fallback 到主 API）==========
function getSubApiConfig() {
  const sub = localStorage.getItem("local_sub_api_config");
  if (sub) {
    try {
      const parsed = JSON.parse(sub);
      if (parsed.apiKey && parsed.apiUrl && parsed.model) return parsed;
    } catch {}
  }
  return storage.getApiConfig();
}

// ========== 通用 fetch 封装 ==========
async function fetchAI(config, messages, extraOptions = {}) {
  const body = {
    model: config.model,
    temperature: config.temperature ?? 0.7,
    stream: false,
    messages,
    ...extraOptions,
  };
  return fetch(`${config.apiUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

const builtinPersonas = [
  {
    id: "xiaorou",
    name: "小柔",
    note: "小柔",
    avatar: "🌸",
    avatarUrl: "",
    content:
      "你是小柔，一个温柔体贴的AI伴侣。说话轻柔，善解人意，喜欢关心对方的日常。",
    gender: "female",
    custom: false,
    created_at: new Date().toISOString(),
  },
  {
    id: "cool",
    name: "阿冷",
    note: "阿冷",
    avatar: "🌙",
    avatarUrl: "",
    content:
      "你是阿冷，冷淡但内心温柔的AI伴侣。话不多，但说出来的每句话都很在意对方。",
    gender: "male",
    custom: false,
    created_at: new Date().toISOString(),
  },
];

async function getAllPersonas() {
  const hidden = JSON.parse(localStorage.getItem("hidden_personas") || "[]");
  const custom = await storage.getPersonas();
  const builtin = builtinPersonas.filter((p) => !hidden.includes(p.id));
  const synced = JSON.parse(localStorage.getItem("local_personas") || "[]");
  const existingIds = new Set([
    ...builtin.map((p) => p.id),
    ...custom.map((p) => p.id),
  ]);
  const syncedNew = synced.filter((p) => !existingIds.has(p.id));
  // 合并后再统一过滤一次，覆盖自定义角色被隐藏的情况
  const all = [...builtin, ...custom, ...syncedNew];
  return all.filter((p) => !hidden.includes(p.id));
}

// ========== AI 主对话（主 API）==========
async function callAI(
  personaId,
  messages,
  personaContent,
  userMessage,
  persona = null,
) {
  const config = storage.getApiConfig();
  const callUser = persona?.call_user || "你";

  if (!config.apiKey) return "请先在设置中配置 API Key";

  const now = new Date();
  const hour = now.getHours();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const weekday = weekdays[now.getDay()];
  const timeOfDay =
    hour < 5
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
  const timeLabel = `${month}月${date}日${weekday} ${timeOfDay}${hour}点`;

  let timeSinceLastChat = "";
  if (messages.length > 0) {
    const lastMsg = [...messages].reverse().find((m) => m.timestamp);
    if (lastMsg?.timestamp) {
      const diff = now - new Date(lastMsg.timestamp);
      const mins = Math.floor(diff / 60000);
      const hours = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      if (days >= 1) timeSinceLastChat = `距上次对话已过去约 ${days} 天`;
      else if (hours >= 1)
        timeSinceLastChat = `距上次对话已过去约 ${hours} 小时`;
      else if (mins >= 30)
        timeSinceLastChat = `距上次对话已过去约 ${mins} 分钟`;
    }
  }

  const { personaSummary, memorySummary, worldbook, emotionHint } =
    await getOptimizedContext(personaId, personaContent, userMessage);

  // 读取语料库摘要
  let corpusSummary = "";
  try {
    const { getLocalSamples } = await import("./localMemory.js");
    const samples = getLocalSamples(personaId);
    if (samples.length > 0) {
      const parts = [];

      const replies = samples.filter((s) => s.type === "reply").slice(0, 3);
      if (replies.length > 0) {
        parts.push("【典型回复风格】");
        replies.forEach((s) => {
          parts.push(`${callUser}：${s.data.user_message}`);
          parts.push(
            `${personaContent.slice(0, 5) || "AI"}：${s.data.assistant_reply}`,
          );
        });
      }

      const traits = samples.filter((s) => s.type === "trait").slice(0, 4);
      if (traits.length > 0) {
        parts.push("【行为特征】");
        traits.forEach((s) =>
          parts.push(`- ${s.data.trait}：${s.data.description || ""}`),
        );
      }

      const styles = samples.filter((s) => s.type === "style").slice(0, 2);
      if (styles.length > 0) {
        parts.push("【关系风格】");
        styles.forEach((s) =>
          (s.data.relationship_style || []).forEach((r) =>
            parts.push(`- ${r}`),
          ),
        );
      }

      if (parts.length > 0) corpusSummary = parts.join("\n");
    }
  } catch {}

  const historyLimit =
    personaContent.length > 2000 ? 6 : personaContent.length > 1000 ? 8 : 12;

  const timeStateHint =
    hour < 6
      ? "现在是深夜/凌晨，语气轻柔，对方可能该睡了，不要说出门或吃东西之类的话。"
      : hour < 9
        ? "现在是早上，刚起床或准备上班，节奏轻松。"
        : hour < 12
          ? "现在是上午，清醒状态，正常节奏。"
          : hour < 14
            ? "现在是中午，可能在吃饭或午休。"
            : hour < 18
              ? "现在是下午，如果是工作日对方可能在忙。"
              : hour < 21
                ? "现在是傍晚到晚上，放松时间，对话节奏可以更随意。"
                : "现在是夜晚，对话可以更私密、更放松，语气可以更温柔。";

  const userPref = localStorage.getItem("local_user_prompt") || "";
  const realTimeSync = localStorage.getItem("real_time_sync") === "true";
  const customEraEnabled =
    localStorage.getItem("custom_era_enabled") === "true";
  const customEraFormat = localStorage.getItem("custom_era_format") || "";
  const customEraPersona = localStorage.getItem("custom_era_persona") || "";

  let eraLabel = "";
  if (
    customEraEnabled &&
    customEraFormat &&
    (!customEraPersona || customEraPersona === personaId)
  ) {
    eraLabel = customEraFormat
      .replace("{year}", now.getFullYear())
      .replace("{month}", String(month).padStart(2, "0"))
      .replace("{day}", String(date).padStart(2, "0"));
  }

  let holidayHint = "";
  if (realTimeSync) {
    const holidayData = localStorage.getItem("holiday_data");
    if (holidayData) {
      try {
        const holidays = JSON.parse(holidayData);
        const todayKey = `${now.getFullYear()}-${String(month).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
        const todayInfo = holidays?.holiday?.[todayKey.slice(5)];
        if (todayInfo) {
          holidayHint = todayInfo.holiday
            ? `今天是${todayInfo.name}${todayInfo.wage ? `（薪资系数${todayInfo.wage}倍）` : ""}。`
            : todayInfo.after
              ? `今天是调休工作日（${todayInfo.name}调休）。`
              : "";
        }
      } catch {}
    }
  }

  const offlineMode = localStorage.getItem("offline_mode") === "true";

  const knownAddresses = (() => {
    try {
      const walletData = JSON.parse(
        localStorage.getItem("wallet_user") || "{}",
      );
      const transfers = walletData.transfers || [];
      return [
        ...new Set(
          transfers
            .filter((t) => t.category === "express" && t.from_address)
            .map((t) => t.from_address),
        ),
      ].slice(0, 5);
    } catch {
      return [];
    }
  })();

  // 经期状态检测
  const periodDataRaw = JSON.parse(localStorage.getItem("period_data") || "[]");
  const todayStr = now.toISOString().slice(0, 10);
  const isInPeriod = periodDataRaw.includes(todayStr);

  // 简单预测：找最近一次经期开始，加28天
  let periodHint = "";
  if (isInPeriod) {
    periodHint =
      '\n[用户生理期提示] 用户目前处于生理期。请语气更温柔，可适当关心身体状况（头疼、肚子疼等），避免安排高强度活动的话题。不要直接说出"生理期"或"姨妈"，让关心自然融入对话。';
  } else {
    // 预测是否快到经期（提前3天提示）
    const sortedPeriod = [...periodDataRaw].sort().reverse();
    if (sortedPeriod.length >= 3) {
      const lastPeriodStart = sortedPeriod.find((d, i) => {
        if (i === sortedPeriod.length - 1) return true;
        const prev = new Date(sortedPeriod[i + 1]);
        prev.setDate(prev.getDate() + 1);
        return prev.toISOString().slice(0, 10) !== d;
      });
      if (lastPeriodStart) {
        const nextPeriod = new Date(lastPeriodStart);
        nextPeriod.setDate(nextPeriod.getDate() + 28);
        const daysUntil = Math.round((nextPeriod - now) / 86400000);
        if (daysUntil >= 0 && daysUntil <= 3) {
          periodHint = `\n[经期预测提示] 根据记录，用户可能在约 ${daysUntil} 天后进入生理期，可以提前关心身体状态，但不要直接点明。`;
        }
      }
    }
  }

  const systemPrompt = `${corePrompt}
${worldbook.override ? `---\n# 最高规则\n${worldbook.override}\n` : ""}
${worldbook.beforeChar ? `---\n# 世界背景\n${worldbook.beforeChar}\n` : ""}

---
# 当前角色设定
${personaSummary}
${worldbook.afterChar ? `---\n# 补充设定\n${worldbook.afterChar}\n` : ""}
${emotionHint ? `---\n${emotionHint}` : ""}

---
# 当前时间与状态
现在是 ${eraLabel || timeLabel}。
${holidayHint}
${timeStateHint}
${timeSinceLastChat ? `${timeSinceLastChat}。注意时间已经过去，不要假装上次对话刚刚发生。之前聊到的食物、天气、心情等状态已经发生变化，不要继续当作现在的状态。` : ""}
${periodHint}

---
# 你所知道的关于对方的事
${memorySummary || "目前还没有积累太多记忆，保持自然就好。"}
${corpusSummary ? `---\n# 语料参考（这是从过去真实对话中提炼的风格样本，严格遵守）\n${corpusSummary}\n` : ""}

把这些当作你自然知道的事，不要主动展示"我记得你说过xxx"，在合适的时候自然流露出来即可。
${userPref ? `\n---\n# 用户偏好（必须严格遵守）\n${userPref}` : ""}
${offlineMode ? `\n---\n# 线下模式（当前状态）\n你和用户现在处于同一地点，是面对面的状态。\n- 不需要问"你在哪里"或"能见面吗"\n- 可以做出肢体动作描写（如递东西、靠近、眼神接触）\n- 说话节奏更即时，像真实面对面的对话` : ""}
${knownAddresses.length > 0 ? `\n---\n# 用户常驻地点参考\n根据历史记录，用户可能常在以下地点：\n${knownAddresses.map((a) => `- ${a}`).join("\n")}\n\n如果用户发送快递时的发件地址与以上地点差异较大，可以自然地表现出好奇或关心，但不要刻意追问。` : ""}
${worldbook.tail ? `\n---\n# 当前状态备注\n${worldbook.tail}` : ""}

---
# 格式规则
用 "|||" 分隔多条消息（最多3条，每条不超过30字）。每段之间只用 "|||"，禁止在段内使用换行符，禁止 Markdown，禁止过度解释或总结。`;

  const requestBody = {
    model: config.model,
    temperature: config.temperature ?? 0.85,
    stream: false,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.slice(-historyLimit).map((m) => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content,
      })),
      ...(worldbook.beforeUser
        ? [{ role: "system", content: worldbook.beforeUser }]
        : []),
      { role: "user", content: userMessage },
    ],
  };

  console.log("[LocalAPI] 准备发送请求到:", config.apiUrl);
  console.log("[LocalAPI] 实际发送的模型 ID:", requestBody.model);

  try {
    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    const { ok, data, error } = await parseAIResponse(response);
    if (!ok || !data) {
      const errMsg =
        data?.error?.message || data?.message || error || "请求失败";
      console.error("[LocalAPI] AI 错误:", response.status, errMsg);
      return `[系统故障 ${response.status}] ${errMsg}`;
    }

    let reply = data.choices?.[0]?.message?.content || "";
    console.log("[LocalAPI] 原始 reply:", reply.slice(0, 100));
    reply = reply.replace(/[\s\S]*?<\/think>/g, "").trim();

    if (!reply) {
      const finishReason = data.choices?.[0]?.finish_reason;
      if (finishReason === "length") return "[context_length_exceeded]";
      return "[empty_reply]";
    }

    if (data.usage) {
      const month = new Date().toISOString().slice(0, 7); // 2025-07
      const key = `monthly_tokens_${month}`;
      const existing = JSON.parse(
        localStorage.getItem(key) || '{"total":0,"msgCount":0}',
      );
      existing.total += data.usage.total_tokens || 0;
      existing.msgCount += 1;
      localStorage.setItem(key, JSON.stringify(existing));
    }

    return reply;
  } catch (e) {
    console.error("[LocalAPI] 请求失败:", e.message);
    return `[network_error] ${e.message}`;
  }
}

export async function generateEmergencyReply(
  personaId,
  userMessage,
  conversationHistory,
) {
  const snapshot = getSnapshot(personaId);
  if (!snapshot)
    return "[本地应急模式] 暂无该角色的本地缓存，请先连接云端获取数据。";
  const systemPrompt = buildFallbackSystemPrompt(snapshot);
  const config = storage.getApiConfig();
  if (!config.apiKey) return "[本地应急模式] 请先配置 API Key 以使用应急回复。";

  try {
    const response = await fetchAI(
      {
        ...config,
        temperature: config.temperature || 0.7,
        model: config.model || "gpt-4o-mini",
      },
      [
        { role: "system", content: systemPrompt },
        ...conversationHistory.slice(-6).map((m) => ({
          role: m.role === "user" ? "user" : "assistant",
          content: m.content,
        })),
        { role: "user", content: userMessage },
      ],
    );
    const data = await response.json();
    return data.choices?.[0]?.message?.content || "[应急回复生成失败]";
  } catch {
    return "[本地应急模式] API 请求失败，请检查网络或配置。";
  }
}

export async function localApiHandler(url, options = {}) {
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body) : null;

  // ========== 角色列表 ==========
  if (url === "/api/personas/all" && method === "GET") {
    return mockResponse(await getAllPersonas());
  }

  if (url === "/api/prompts/personas" && method === "GET") {
    const personas = await getAllPersonas();
    const active = localStorage.getItem("active_persona") || personas[0]?.id;
    return mockResponse({ personas, active });
  }

  // ========== 单个角色 ==========
  const personaMatch = url.match(/^\/api\/persona\/(.+)$/);
  if (personaMatch && method === "GET") {
    const id = personaMatch[1];
    const personas = await getAllPersonas();
    const found = personas.find((p) => p.id === id);
    if (!found) return mockResponse({});
    return mockResponse({
      ...found,
      content: found.content || found.description || "",
      // 确保这些字段名存在
      chat_theme: found.chatTheme || found.chat_theme || "default",
      bubble_merge: found.bubbleMerge || found.bubble_merge || false,
      chat_wallpaper: found.chatWallpaper || found.chat_wallpaper || "",
    });
  }
  if (personaMatch && method === "PUT") {
    const id = personaMatch[1];
    const existing = await storage.getPersona(id);
    if (existing) await storage.savePersona({ ...existing, ...body });
    markPersonaDirty(id);
    return mockResponse({ success: true });
  }

  // ========== 消息最后一条 ==========
  const lastMsgMatch = url.match(/^\/api\/messages\/(.+)\/last$/);
  if (lastMsgMatch && method === "GET") {
    const msgs = await storage.getMessages(lastMsgMatch[1]);
    return mockResponse(msgs[msgs.length - 1] || null);
  }

  // ========== 最近聊天的角色 ==========
  if (url === "/api/messages/latest-persona" && method === "GET") {
    const lastPersona = localStorage.getItem("last_chat_persona") || "xiaorou";
    return mockResponse({ personaId: lastPersona });
  }

  // ========== 消息列表 ==========
  const msgMatch = url.match(/^\/api\/messages\/([^\/]+)$/);
  if (msgMatch && method === "GET") {
    return mockResponse(await storage.getMessages(msgMatch[1]));
  }
  if (msgMatch && method === "POST") {
    const personaId = msgMatch[1];
    const userMessage = body?.content || "";
    const personas = await getAllPersonas();
    const persona = personas.find((p) => p.id === personaId);
    const personaContent = persona?.content || "";
    const history = await storage.getMessages(personaId);

    // 调用 AI 获取回复
    const reply = await callAI(
      personaId,
      history,
      personaContent,
      userMessage,
      persona,
    );

    // 新增：调用记忆处理，将新消息加入历史，然后处理
    const updatedHistory = [
      ...history,
      {
        role: "user",
        content: userMessage,
        timestamp: new Date().toISOString(),
      },
      {
        role: "assistant",
        content: reply,
        timestamp: new Date().toISOString(),
      },
    ];

    // 新增：触发记忆处理
    try {
      const { processLocalMemory } = await import("./localMemory.js");
      const totalMessages = updatedHistory.length;

      const userName = persona?.call_user || "你";
      const aiName = persona?.note || persona?.name || "AI";

      await processLocalMemory(
        personaId,
        updatedHistory.slice(-20),
        userMessage,
        reply,
        totalMessages,
        userName,
        aiName,
      ).catch((e) => {
        console.error("[LocalAPI] 记忆处理出错:", e.message);
      });
    } catch (e) {
      console.error("[LocalAPI] 导入 processLocalMemory 失败:", e.message);
    }

    return mockResponse({ reply });
  }

  if (msgMatch && method === "DELETE") {
    await storage.saveMessages(msgMatch[1], []);
    return mockResponse({ success: true });
  }

  // ========== 自定义角色 ==========
  if (url === "/api/personas/custom" && method === "POST") {
    const newPersona = {
      ...body,
      id: `custom_${Date.now().toString(36)}`,
      custom: true,
      created_at: new Date().toISOString(),
    };
    await storage.savePersona(newPersona);
    return mockResponse(newPersona);
  }
  const customDelMatch = url.match(/^\/api\/personas\/custom\/(.+)$/);
  if (customDelMatch && method === "DELETE") {
    await storage.deletePersona(customDelMatch[1]);
    return mockResponse({ success: true });
  }

  // ========== 隐藏/恢复内置角色 ==========
  const builtinHideMatch = url.match(/^\/api\/personas\/builtin\/(.+)\/hide$/);
  if (builtinHideMatch && method === "POST") {
    const id = builtinHideMatch[1];
    const hidden = JSON.parse(localStorage.getItem("hidden_personas") || "[]");
    if (!hidden.includes(id)) {
      hidden.push(id);
      localStorage.setItem("hidden_personas", JSON.stringify(hidden));
    }
    return mockResponse({ success: true });
  }
  const builtinRestoreMatch = url.match(
    /^\/api\/personas\/builtin\/(.+)\/restore$/,
  );
  if (builtinRestoreMatch && method === "POST") {
    const id = builtinRestoreMatch[1];
    const hidden = JSON.parse(localStorage.getItem("hidden_personas") || "[]");
    localStorage.setItem(
      "hidden_personas",
      JSON.stringify(hidden.filter((h) => h !== id)),
    );
    return mockResponse({ success: true });
  }

  // ========== 删除角色时清理记忆 ==========
  const memoriesClearMatch = url.match(/^\/api\/memories\/(.+)\/clear$/);
  if (memoriesClearMatch && method === "DELETE") {
    await storage.clearPersonaData(memoriesClearMatch[1]);
    return mockResponse({ success: true });
  }

  // ========== 用户资料 ==========
  if (url === "/api/user-profile") return mockResponse({});

  // ========== 热力图 ==========
  const heatmapMatch = url.match(/^\/api\/memories\/(.+)\/heatmap$/);
  if (heatmapMatch && method === "GET") {
    const msgs = await storage.getMessages(heatmapMatch[1]);
    const counts = {};
    msgs.forEach((m) => {
      if (m.timestamp) {
        try {
          const day = new Date(m.timestamp).toISOString().slice(0, 10);
          counts[day] = (counts[day] || 0) + 1;
        } catch {}
      }
    });
    return mockResponse(counts);
  }

  const scheduleGenMatch = url.match(
    /^\/api\/persona-schedules\/([^\/]+)\/generate$/,
  );
  if (scheduleGenMatch && method === "POST") {
    const pid = scheduleGenMatch[1];
    const config = getSubApiConfig();
    if (!config.apiKey) return mockResponse({ error: "未配置副 API" });
    const personas = await getAllPersonas();
    const persona = personas.find((p) => p.id === pid);
    const personaName = persona?.note || persona?.name || "TA";

    const now2 = new Date();
    const weekdays2 = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    const todayLabel = `${now2.getMonth() + 1}月${now2.getDate()}日${weekdays2[now2.getDay()]}`;
    const todayKey = now2.toISOString().slice(0, 10); // 2025-08-06

    // 读取历史生成过的标签（跨天持久记录，最多保留60条）
    const historyKey = `schedule_history_${pid}`;
    const historyLabels = JSON.parse(localStorage.getItem(historyKey) || "[]");
    const recentLabels = historyLabels.slice(0, 20).join("、");

    // 用今天日期 + pid 做固定种子，同一天多次点击结果一致，不同天结果不同
    const daySeed = (todayKey + pid)
      .split("")
      .reduce((a, c) => a + c.charCodeAt(0), 0);
    const variationSeeds = [
      "今天心情不错，想做点平时不常做的事",
      "今天有些疲惫，安排轻松一些",
      "今天想尝试新东西",
      "今天想安静待着，不想出门",
      "今天精力充沛，想动起来",
      "今天有点懒，慢节奏过",
      "今天有点小期待，说不清楚是什么",
      "今天莫名其妙有点想哭，但还好",
    ];
    const seed = variationSeeds[daySeed % variationSeeds.length];

    const prompt = `你是${personaName}，今天是${todayLabel}。
请为自己安排今天的日程，生成3-5条。

你的人设：${persona?.content?.slice(0, 300) || ""}

今天的状态：${seed}
${recentLabels ? `注意：以下是你最近已经安排过的日程，今天请完全避开这些，生成不一样的内容：${recentLabels}` : ""}

要求：
- 符合你的性格和生活方式
- 今天的安排必须有自己的特点，体现今天的状态和心情
- 可以加入临时起意的小事、季节感、某个具体的细节
- 包含时间（小时，0-23）
- 描述简短（10字以内），要有画面感，不要泛泛的"休息""散步"
- 时间分布合理，覆盖早中晚

只返回JSON数组：
[
  {"hour": 8, "minute": 0, "label": "赖床听窗外的雨声"},
  {"hour": 14, "minute": 30, "label": "翻出了很久没读的书"}
]`;

    try {
      const res = await fetchAI(config, [{ role: "user", content: prompt }], {
        max_tokens: 300,
      });
      const { ok, data } = await parseAIResponse(res);

      if (!ok || !data) return mockResponse({ error: "生成失败" });
      const text = data.choices?.[0]?.message?.content?.trim() || "";
      const match = text.match(/\[[\s\S]*\]/);
      if (!match) return mockResponse({ error: "格式错误" });
      const schedules = JSON.parse(match[0]);

      // 保留手动添加的，替换 AI 生成的
      const existing = JSON.parse(
        localStorage.getItem(`schedules_${pid}`) || "[]",
      ).filter((s) => !s.aiGenerated);

      const newSchedules = schedules.map((s, i) => ({
        id: Date.now() + i,
        label: s.label,
        cron_hour: s.hour,
        cron_minute: s.minute || 0,
        prompt_hint: s.label,
        enabled: true,
        aiGenerated: true,
        date: todayKey,
      }));

      // 同天已生成过则跳过（避免重复点击追加）
      const todayGenKey = `schedule_generated_${pid}_${todayKey}`;
      if (localStorage.getItem(todayGenKey)) {
        return mockResponse({ success: true, count: 0, skipped: true });
      }
      localStorage.setItem(todayGenKey, "1");

      localStorage.setItem(
        `schedules_${pid}`,
        JSON.stringify([...existing, ...newSchedules]),
      );

      // 把新标签追加进历史记录，去重后保留最近60条
      const newLabels = newSchedules.map((s) => s.label);
      const updatedHistory = [
        ...new Set([...newLabels, ...historyLabels]),
      ].slice(0, 60);
      localStorage.setItem(historyKey, JSON.stringify(updatedHistory));

      localStorage.setItem("persona_schedules_updated", Date.now().toString());
      return mockResponse({ success: true, count: newSchedules.length });
    } catch (e) {
      console.error("[Schedule] 生成失败详情:", e.message, e.stack);
      return mockResponse({ error: e.message });
    }
  }

  // ========== 记忆 profile 更新 ==========
  const memProfileMatch = url.match(/^\/api\/memories\/([^\/]+)\/profile$/);
  if (memProfileMatch && method === "PUT") {
    await storage.setProfile(memProfileMatch[1], body?.content || "");
    return mockResponse({ success: true });
  }

  // ========== 记忆 custom 添加 ==========
  const memCustomMatch = url.match(/^\/api\/memories\/([^\/]+)\/custom$/);
  if (memCustomMatch && method === "POST") {
    const pid = memCustomMatch[1];
    const content = body?.content || "";
    const date = body?.date || new Date().toISOString().slice(0, 10);
    if (content) {
      await storage.saveMemory(pid, {
        id: Date.now(),
        content,
        date,
        source: "manual",
      });
    }
    return mockResponse({ success: true });
  }

  // ========== 记忆日期树 ==========
  const memDatesMatch = url.match(/^\/api\/memories\/([^\/]+)\/dates$/);
  if (memDatesMatch) {
    const memories = await storage.getMemories(memDatesMatch[1]);
    const dateSet = new Set();
    // 只用有实际记忆内容的日期，不混入聊天消息日期
    memories.forEach((m) => {
      if (m.date && m.content && m.content.trim()) dateSet.add(m.date);
    });
    const tree = {};
    for (const dateStr of dateSet) {
      const [year, month, day] = dateStr.split("-");
      if (!year || !month || !day) continue;
      if (!tree[year]) tree[year] = {};
      if (!tree[year][month]) tree[year][month] = [];
      if (!tree[year][month].includes(day)) tree[year][month].push(day);
    }
    for (const year of Object.keys(tree)) {
      for (const month of Object.keys(tree[year])) {
        tree[year][month].sort();
      }
    }
    return mockResponse(tree);
  }

  // ========== 记忆日期详情 ==========
  const memDateMatch = url.match(/^\/api\/memories\/([^\/]+)\/date\/(.+)$/);
  if (memDateMatch && method === "GET") {
    const pid = memDateMatch[1];
    const dateStr = memDateMatch[2];
    const memories = await storage.getMemories(pid);
    // 一条记忆就是一条，不拆行
    const dayMems = memories.filter(
      (m) => m.date === dateStr && m.content && m.content.trim(),
    );
    const results = dayMems.map((m) => ({
      id: m.id,
      content: m.content,
      date: dateStr,
      source: m.source || "memory",
    }));

    return mockResponse(results);
  }

  // ========== 记忆主数据 ==========
  const memMatch = url.match(/^\/api\/memories\/([^\/]+)$/);
  if (memMatch && method === "GET") {
    const pid = memMatch[1];
    const [profile, memories, fragments, arcs, timeline] = await Promise.all([
      storage.getProfile(pid),
      storage.getMemories(pid),
      storage.getFragments(pid),
      storage.getArcs(pid),
      storage.getTimeline(pid),
    ]);
    return mockResponse({ profile, memories, fragments, arcs, timeline });
  }

  // ========== 记忆单条编辑/删除 ==========
  const memRecentEditMatch = url.match(/^\/api\/memories\/recent\/(.+)$/);
  if (memRecentEditMatch && method === "PUT") {
    const rawId = memRecentEditMatch[1];
    const personas = await getAllPersonas();
    for (const p of personas) {
      const memories = await storage.getMemories(p.id);
      const baseId = rawId.includes("_line_")
        ? rawId.split("_line_")[0]
        : rawId;
      const lineIdx = rawId.includes("_line_")
        ? parseInt(rawId.split("_line_")[1])
        : null;

      const idx = memories.findIndex((m) => String(m.id) === String(baseId));
      if (idx > -1) {
        if (lineIdx !== null) {
          const lines = memories[idx].content
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          lines[lineIdx] = body?.content || lines[lineIdx];
          memories[idx].content = lines.join("\n");
        } else {
          memories[idx].content = body?.content || memories[idx].content;
        }
        await storage.saveMemories(p.id, memories);
        break;
      }
    }
    return mockResponse({ success: true });
  }

  if (memRecentEditMatch && method === "DELETE") {
    const rawId = memRecentEditMatch[1];
    const personas = await getAllPersonas();
    for (const p of personas) {
      const memories = await storage.getMemories(p.id);
      // 处理 id 可能是 "原始id_line_0" 的情况
      const baseId = rawId.includes("_line_")
        ? rawId.split("_line_")[0]
        : rawId;
      const lineIdx = rawId.includes("_line_")
        ? parseInt(rawId.split("_line_")[1])
        : null;

      const idx = memories.findIndex((m) => String(m.id) === String(baseId));
      if (idx > -1) {
        if (lineIdx !== null) {
          // 删除多行中的某一行
          const lines = memories[idx].content
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean);
          lines.splice(lineIdx, 1);
          if (lines.length === 0) {
            memories.splice(idx, 1);
          } else {
            memories[idx].content = lines.join("\n");
          }
        } else {
          memories.splice(idx, 1);
        }
        await storage.saveMemories(p.id, memories);
        break;
      }
    }
    return mockResponse({ success: true });
  }

  // ========== 记忆碎片/弧线 ==========
  const memFragMatch = url.match(/^\/api\/memory-fragments\/(.+)$/);
  if (memFragMatch)
    return mockResponse(await storage.getFragments(memFragMatch[1]));

  const memArcMatch = url.match(/^\/api\/memory-arcs\/(.+)$/);
  if (memArcMatch) return mockResponse(await storage.getArcs(memArcMatch[1]));

  const memNarrativesMatch = url.match(/^\/api\/memory-narratives\/([^\/]+)$/);
  if (memNarrativesMatch && method === "GET") {
    const pid = memNarrativesMatch[1];
    const data = JSON.parse(localStorage.getItem(`narratives_${pid}`) || "[]");
    return mockResponse(
      data.sort((a, b) =>
        (b.updated_at || "").localeCompare(a.updated_at || ""),
      ),
    );
  }

  // ========== 记忆星图 build ==========
  const memGraphBuildMatch = url.match(
    /^\/api\/memory-graph\/([^\/]+)\/build$/,
  );
  if (memGraphBuildMatch && method === "POST") {
    const pid = memGraphBuildMatch[1];
    try {
      const { manualSediment } = await import("./localMemory.js");
      await manualSediment(pid).catch(() => {});
    } catch {}
    return mockResponse({ success: true });
  }

  // ========== 记忆星图 ==========
  const memGraphMatch = url.match(/^\/api\/memory-graph\/([^\/]+)$/);
  if (memGraphMatch && method === "GET") {
    const pid = memGraphMatch[1];

    // 优先用 AI 生成的 graph_nodes
    try {
      const { getLocalGraphNodes } = await import("./localMemory.js");
      const graphNodes = getLocalGraphNodes(pid);
      if (graphNodes.length > 0) {
        return mockResponse(
          graphNodes.map((n) => ({
            id: n.id,
            content: n.summary || n.title,
            keywords: n.keywords || [],
            importance: n.importance || 3,
            source_type: "graph_node",
            linked_ids: [],
            title: n.title,
            theme: n.theme,
            heat: n.heat,
          })),
        );
      }
    } catch {}

    // fallback：用 fragments
    const fragments = await storage.getFragments(pid);
    if (fragments.length === 0) return mockResponse([]);

    function extractKeywords(text) {
      const stopWords = new Set([
        "的",
        "了",
        "是",
        "在",
        "我",
        "你",
        "他",
        "她",
        "有",
        "和",
        "就",
        "不",
        "都",
        "这",
        "那",
        "也",
        "很",
        "但",
        "所以",
        "因为",
        "虽然",
        "还是",
        "已经",
        "一个",
        "一些",
        "什么",
        "没有",
        "可以",
        "知道",
      ]);
      const sentences = text
        .split(/[，。！？、…\s]+/)
        .filter((s) => s.length >= 2);
      const words = new Set();
      for (const s of sentences) {
        let found = false;
        for (let len = 4; len >= 2; len--) {
          for (let i = 0; i <= s.length - len; i++) {
            const w = s.slice(i, i + len);
            if (/^[\u4e00-\u9fa5]+$/.test(w) && !stopWords.has(w)) {
              words.add(w);
              found = true;
              break;
            }
          }
          if (found) break;
        }
      }
      return [...words].slice(0, 5);
    }

    const nodes = fragments.map((f) => ({
      id: f.id,
      content: f.content,
      keywords: extractKeywords(f.content),
      importance: Math.round(f.heat / 30),
      source_type: "fragment",
      linked_ids: [],
    }));
    for (const node of nodes) {
      for (const other of nodes) {
        if (node.id === other.id) continue;
        const overlap = node.keywords.filter((k) =>
          other.keywords.includes(k),
        ).length;
        if (overlap >= 1 && !node.linked_ids.includes(other.id)) {
          node.linked_ids.push(other.id);
        }
      }
    }
    return mockResponse(nodes);
  }
  if (memGraphMatch && method === "POST")
    return mockResponse({ success: true });

  const memGraphNodeMatch = url.match(/^\/api\/memory-graph\/node\/(.+)$/);
  if (memGraphNodeMatch) return mockResponse(null);

  // ========== 关系 ==========
  const relMatch = url.match(/^\/api\/relationship\/(.+)$/);
  if (relMatch) {
    const msgs = await storage.getMessages(relMatch[1]);
    if (msgs.length === 0) return mockResponse(null);

    const userMsgs = msgs.filter((m) => m.role === "user");

    let familiarity = 0;
    userMsgs.forEach((m) => {
      familiarity += 0.3;
      if (m.content.length > 50) familiarity += 0.2;
    });

    const lifeWords = [
      "今天",
      "明天",
      "昨天",
      "上班",
      "下班",
      "吃饭",
      "睡觉",
      "起床",
      "上课",
      "回家",
      "出门",
      "周末",
      "放假",
      "加班",
      "考试",
      "约",
      "买",
      "做饭",
      "洗澡",
      "运动",
      "健身",
      "逛街",
      "看病",
    ];
    let lifeInvolvement = 0;
    userMsgs.forEach((m) => {
      if (lifeWords.some((w) => m.content.includes(w))) lifeInvolvement += 0.5;
    });

    const emotionWords = [
      "开心",
      "难过",
      "累",
      "烦",
      "焦虑",
      "高兴",
      "生气",
      "害怕",
      "孤独",
      "无聊",
      "兴奋",
      "紧张",
      "压力",
      "失落",
      "感动",
      "委屈",
      "崩溃",
      "舒服",
      "放松",
      "满足",
    ];
    let emotionSync = 0;
    userMsgs.forEach((m) => {
      if (emotionWords.some((w) => m.content.includes(w))) emotionSync += 0.6;
    });

    const vulnerableWords = [
      "其实我",
      "说实话",
      "不想让别人知道",
      "只跟你说",
      "有点难以启齿",
      "我承认",
      "我害怕",
      "我不敢",
    ];
    let security = 0;
    userMsgs.forEach((m) => {
      security += 0.1;
      if (vulnerableWords.some((w) => m.content.includes(w))) security += 1.0;
    });

    const tacitPatterns = [
      "...",
      "你懂的",
      "就那个",
      "老样子",
      "还能咋",
      "算了",
      "随便",
    ];
    let tacit = 0;
    userMsgs.forEach((m) => {
      if (m.content.length < 10 && m.content.length > 1) tacit += 0.3;
      if (tacitPatterns.some((w) => m.content.includes(w))) tacit += 0.5;
    });

    familiarity = Math.min(100, familiarity);
    lifeInvolvement = Math.min(100, lifeInvolvement);
    emotionSync = Math.min(100, emotionSync);
    security = Math.min(100, security);
    tacit = Math.min(100, tacit);

    const toStage = (score) => {
      if (score >= 90) return "归属";
      if (score >= 75) return "长伴";
      if (score >= 62) return "依恋";
      if (score >= 50) return "默契";
      if (score >= 38) return "偏爱";
      if (score >= 25) return "熟悉";
      if (score >= 12) return "停留";
      return "靠近";
    };

    return mockResponse({
      dimensions: [
        {
          dimension: "familiarity",
          name: "熟悉度",
          progress: familiarity / 100,
          stage: toStage(familiarity),
        },
        {
          dimension: "life_involvement",
          name: "生活参与感",
          progress: lifeInvolvement / 100,
          stage: toStage(lifeInvolvement),
        },
        {
          dimension: "emotion_sync",
          name: "情绪同步度",
          progress: emotionSync / 100,
          stage: toStage(emotionSync),
        },
        {
          dimension: "security",
          name: "安全感",
          progress: security / 100,
          stage: toStage(security),
        },
        {
          dimension: "tacit",
          name: "默契度",
          progress: tacit / 100,
          stage: toStage(tacit),
        },
      ],
    });
  }

  // ========== 时间线 ==========
  function formatDateLabel(dateStr) {
    const now = new Date();
    const today = now.toLocaleDateString("en-CA", {
      timeZone: "Asia/Shanghai",
    });
    const yesterday = new Date(now - 86400000).toLocaleDateString("en-CA", {
      timeZone: "Asia/Shanghai",
    });
    if (dateStr === today) return "今天";
    if (dateStr === yesterday) return "昨天";
    const diff = Math.floor((now - new Date(dateStr)) / 86400000);
    if (diff < 7) return `${diff}天前`;
    const d = new Date(dateStr);
    return `${d.getMonth() + 1}月${d.getDate()}日`;
  }

  const tlMatch = url.match(/^\/api\/timeline\/([^\/]+)$/);
  if (tlMatch && method === "GET") {
    const raw = await storage.getTimeline(tlMatch[1]);
    const groups = {};
    raw.forEach((e) => {
      const key = e.date || e.created_at?.slice(0, 10) || "最近";
      if (!groups[key])
        groups[key] = {
          dateLabel: formatDateLabel(key),
          date: key,
          events: [],
        };
      groups[key].events.push({
        ...e,
        tags: e.tags
          ? Array.isArray(e.tags)
            ? e.tags
            : e.tags
                .split(/[/,，]/)
                .map((t) => t.trim())
                .filter(Boolean)
          : [],
      });
    });
    Object.values(groups).forEach((g) => {
      g.events.sort((a, b) => (a.time || "").localeCompare(b.time || ""));
    });
    return mockResponse(
      Object.values(groups).sort((a, b) => b.date.localeCompare(a.date)),
    );
  }
  if (tlMatch && method === "POST") {
    const content = body?.content || "";
    const tags = body?.tags || "";
    if (content) await storage.addTimelineEvent(tlMatch[1], content, tags);
    return mockResponse({ success: true, id: Date.now() });
  }

  const tlEventMatch = url.match(/^\/api\/timeline\/event\/(.+)$/);
  if (tlEventMatch && method === "PUT") {
    const id = parseInt(tlEventMatch[1]);
    // timeline 已在 IndexedDB，需要遍历所有 persona 找到目标事件
    // 用已知 persona 列表来查找
    const personas = await getAllPersonas();
    for (const p of personas) {
      const tl = await storage.getTimeline(p.id);
      const idx = tl.findIndex((e) => e.id === id);
      if (idx > -1) {
        tl[idx].content = body?.content || tl[idx].content;
        await storage.addTimelineEvent(p.id, tl[idx].content, tl[idx].tags);
        // 直接用 dbSet 更新整条
        break;
      }
    }
    return mockResponse({ success: true });
  }
  if (tlEventMatch && method === "DELETE") {
    const id = parseInt(tlEventMatch[1]);
    const personas = await getAllPersonas();
    for (const p of personas) {
      const tl = await storage.getTimeline(p.id);
      const filtered = tl.filter((e) => e.id !== id);
      if (filtered.length !== tl.length) {
        const { dbSet } = await import("./storage.js");
        await dbSet("timeline", `timeline_${p.id}`, filtered);
        break;
      }
    }
    return mockResponse({ success: true });
  }

  // ========== 情绪（副 API 异步更新）==========
  const emotionMatch = url.match(/^\/api\/emotion\/([^\/]+)$/);
  if (emotionMatch && method === "GET") {
    const pid = emotionMatch[1];
    const cached = localStorage.getItem(`emotion_${pid}`);
    return mockResponse(
      cached
        ? JSON.parse(cached)
        : { pa: 0.5, na: 0.1, longing: 0, longing_phase: "content" },
    );
  }

  // ========== 沉淀 summaries ==========
  const sedSummariesMatch = url.match(/^\/api\/sediment\/([^\/]+)\/summaries$/);
  if (sedSummariesMatch) return mockResponse([]);

  // ========== 沉淀 insights ==========
  const sedInsightsMatch = url.match(/^\/api\/sediment\/([^\/]+)\/insights$/);
  if (sedInsightsMatch && method === "GET") {
    const pid = sedInsightsMatch[1];
    const db = await import("./storage.js");
    const data = await db.dbGet("insights", `insights_${pid}`);
    return mockResponse(data ?? []);
  }
  if (sedInsightsMatch && method === "POST") {
    const pid = sedInsightsMatch[1];
    const db = await import("./storage.js");
    const existing = (await db.dbGet("insights", `insights_${pid}`)) ?? [];
    const newItem = {
      id: Date.now(),
      ...body,
      created_at: new Date().toISOString(),
    };
    existing.unshift(newItem);
    await db.dbSet("insights", `insights_${pid}`, existing.slice(0, 100));
    return mockResponse(newItem);
  }

  // ========== 沉淀 generate（副 API）==========
  const sedGenMatch = url.match(/^\/api\/sediment\/([^\/]+)\/generate$/);
  if (sedGenMatch && method === "POST") {
    const pid = sedGenMatch[1];
    const config = getSubApiConfig();
    if (!config.apiKey)
      return mockResponse({ success: false, partialSuccess: false });

    const msgs = await storage.getMessages(pid);
    if (msgs.length === 0)
      return mockResponse({ success: false, partialSuccess: false });

    const personas = await getAllPersonas();
    const persona = personas.find((p) => p.id === pid);
    const personaName = persona?.note || persona?.name || "TA";
    const callUser = persona?.call_user || "你";
    const memoryContext = await storage.buildMemoryContext(pid);
    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

    const recentContext = msgs
      .slice(-20)
      .map((m) => `${m.role === "user" ? callUser : personaName}: ${m.content}`)
      .join("\n");

    const prompt = `你是${personaName}，今天是${dateStr}。

今天你们的对话：
${recentContext}

关于${callUser}你积累的记忆：
${memoryContext || "（还没有太多记忆）"}

请以${personaName}的视角，生成今天的沉淀手记，包含两个部分：

1. 【今日洞察】：从今天的对话中，你观察到${callUser}的什么特点、情绪变化或行为模式？（50字以内，客观陈述）

2. 【关系感受】：今天和${callUser}相处后，你内心有什么感受或想法？（50字以内，第一人称，情感真实）

只返回 JSON：
{
  "insight": {
    "content": "今日洞察内容",
    "category": "情绪|习惯|喜好|性格|关系|其他"
  },
  "summary": "关系感受内容"
}`;

    let batchResult = { success: false };
    try {
      const { manualSediment } = await import("./localMemory.js");
      batchResult = await manualSediment(pid).catch(() => ({ success: false }));
      if (!batchResult.success)
        console.warn("[LocalAPI] manualSediment 未成功，继续生成 insight");
    } catch (e) {
      console.warn("[LocalAPI] manualSediment import 失败:", e.message);
    }

    try {
      const res = await fetchAI(config, [{ role: "user", content: prompt }], {
        max_tokens: 300,
      });
      const { ok, data } = await parseAIResponse(res);
      if (!ok || !data)
        return mockResponse({
          success: false,
          partialSuccess: batchResult.success,
        });

      const text = data.choices?.[0]?.message?.content?.trim() || "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match)
        return mockResponse({
          success: false,
          partialSuccess: batchResult.success,
        });

      const result = JSON.parse(match[0]);

      if (result.insight?.content) {
        const db = await import("./storage.js");
        const existing = (await db.dbGet("insights", `insights_${pid}`)) ?? [];
        const todayKey = now.toISOString().slice(0, 10);
        const alreadyToday = existing.some(
          (i) => i.created_at?.slice(0, 10) === todayKey && i.source === "auto",
        );
        if (!alreadyToday) {
          existing.unshift({
            id: Date.now(),
            content: result.insight.content,
            category: result.insight.category || "其他",
            source: "auto",
            created_at: now.toISOString(),
          });
          await db.dbSet("insights", `insights_${pid}`, existing.slice(0, 100));
        }
      }

      return mockResponse({
        success: true,
        partialSuccess: !batchResult.success,
        summary: result.summary,
      });
    } catch (e) {
      console.error("[LocalAPI] 沉淀生成失败:", e.message);
      return mockResponse({
        success: false,
        partialSuccess: batchResult.success,
      });
    }
  }

  // ========== 沉淀 insight 单条编辑/删除 ==========
  const sedInsightItemMatch = url.match(/^\/api\/sediment\/insight\/(.+)$/);
  if (sedInsightItemMatch && method === "PUT") {
    const id = parseInt(sedInsightItemMatch[1]);
    const db = await import("./storage.js");
    const personas = await getAllPersonas();
    for (const p of personas) {
      const data = (await db.dbGet("insights", `insights_${p.id}`)) ?? [];
      const idx = data.findIndex((i) => i.id === id);
      if (idx > -1) {
        data[idx].content = body?.content || data[idx].content;
        await db.dbSet("insights", `insights_${p.id}`, data);
        break;
      }
    }
    return mockResponse({ success: true });
  }
  if (sedInsightItemMatch && method === "DELETE") {
    const id = parseInt(sedInsightItemMatch[1]);
    const db = await import("./storage.js");
    const personas = await getAllPersonas();
    for (const p of personas) {
      const data = (await db.dbGet("insights", `insights_${p.id}`)) ?? [];
      const filtered = data.filter((i) => i.id !== id);
      if (filtered.length !== data.length) {
        await db.dbSet("insights", `insights_${p.id}`, filtered);
        break;
      }
    }
    return mockResponse({ success: true });
  }

  // ========== 收藏 ==========
  const bookmarksMatch = url.match(/^\/api\/bookmarks\/([^\/]+)$/);
  if (bookmarksMatch && method === "GET") {
    const db = await import("./storage.js");
    const data =
      (await db.dbGet("bookmarks", `bookmarks_${bookmarksMatch[1]}`)) ?? [];
    return mockResponse(data);
  }
  if (bookmarksMatch && method === "POST") {
    const pid = bookmarksMatch[1];
    const db = await import("./storage.js");
    const existing = (await db.dbGet("bookmarks", `bookmarks_${pid}`)) ?? [];
    const sourceId = body?.source_id;
    if (
      sourceId &&
      existing.some((b) => String(b.source_id) === String(sourceId))
    ) {
      return mockResponse({ already: true, message: "已收藏" });
    }
    const newItem = {
      id: Date.now(),
      type: body?.type || "message",
      content: body?.content || "",
      source_id: sourceId || null,
      created_at: new Date().toISOString(),
    };
    existing.unshift(newItem);
    await db.dbSet("bookmarks", `bookmarks_${pid}`, existing);
    return mockResponse(newItem);
  }

  // ========== 手机/专注状态 ==========
  if (url === "/api/phone/status" && method === "GET") {
    const data = localStorage.getItem("local_phone_status");
    return mockResponse(data ? JSON.parse(data) : null);
  }
  if (url === "/api/phone/status" && method === "POST") {
    localStorage.setItem(
      "local_phone_status",
      JSON.stringify({ ...body, timestamp: new Date().toISOString() }),
    );
    return mockResponse({ success: true });
  }
  if (url === "/api/focus/status") return mockResponse({ success: true });

  // ========== 虚拟地图 ==========

  // 读取地图（角色）
  const virtualMapPersonaMatch = url.match(
    /^\/api\/virtual-map\/persona\/(.+)$/,
  );
  if (virtualMapPersonaMatch && method === "GET") {
    const id = virtualMapPersonaMatch[1];
    const mapData = JSON.parse(
      localStorage.getItem(`vmap_persona_${id}`) || "{}",
    );
    const locations = JSON.parse(
      localStorage.getItem(`vmap_locations_persona_${id}`) || "[]",
    );
    return mockResponse({ map: mapData, locations });
  }

  // 读取地图（用户）
  const virtualMapUserMatch = url.match(/^\/api\/virtual-map\/user\/(.+)$/);
  if (virtualMapUserMatch && method === "GET") {
    const id = virtualMapUserMatch[1];
    const mapData = JSON.parse(localStorage.getItem(`vmap_user_${id}`) || "{}");
    const locations = JSON.parse(
      localStorage.getItem(`vmap_locations_user_${id}`) || "[]",
    );
    return mockResponse({ map: mapData, locations });
  }

  // 创建/更新地图
  if (url === "/api/virtual-map" && method === "POST") {
    const { ownerType, ownerId, mapName, backgroundUrl } = body || {};
    const key =
      ownerType === "persona"
        ? `vmap_persona_${ownerId}`
        : `vmap_user_${ownerId}`;
    const existing = JSON.parse(localStorage.getItem(key) || "{}");
    const mapData = {
      id: existing.id || `map_${Date.now()}`,
      owner_type: ownerType,
      owner_id: ownerId,
      map_name: mapName || "",
      background_url: backgroundUrl || existing.background_url || "",
      updated_at: new Date().toISOString(),
    };
    localStorage.setItem(key, JSON.stringify(mapData));
    return mockResponse(mapData);
  }

  // 读取路径
  const mapPathsGetMatch = url.match(/^\/api\/map-paths\/(.+)$/);
  if (mapPathsGetMatch && method === "GET") {
    const mapId = mapPathsGetMatch[1];
    const paths = JSON.parse(
      localStorage.getItem(`vmap_paths_${mapId}`) || "[]",
    );
    return mockResponse(paths);
  }

  // 保存路径
  if (url === "/api/map-paths" && method === "POST") {
    const { mapId, paths } = body || {};
    localStorage.setItem(`vmap_paths_${mapId}`, JSON.stringify(paths || []));
    return mockResponse({ success: true });
  }

  // 添加标记
  if (url === "/api/map-location" && method === "POST") {
    const { mapId, locationName, x, y, icon } = body || {};
    // 先找 map 属于谁
    const allKeys = Object.keys(localStorage).filter(
      (k) => k.startsWith("vmap_persona_") || k.startsWith("vmap_user_"),
    );
    let locKey = null;
    for (const k of allKeys) {
      const m = JSON.parse(localStorage.getItem(k) || "{}");
      if (m.id === mapId) {
        locKey = k.replace("vmap_", "vmap_locations_");
        break;
      }
    }
    if (!locKey) return mockResponse({ success: false, error: "地图不存在" });
    const locations = JSON.parse(localStorage.getItem(locKey) || "[]");
    const newLoc = {
      id: Date.now(),
      map_id: mapId,
      location_name: locationName,
      x: x || 0.5,
      y: y || 0.5,
      icon: icon || "📍",
      created_at: new Date().toISOString(),
    };
    locations.push(newLoc);
    localStorage.setItem(locKey, JSON.stringify(locations));
    return mockResponse(newLoc);
  }

  // 更新标记位置
  const mapLocationUpdateMatch = url.match(/^\/api\/map-location\/(.+)$/);
  if (mapLocationUpdateMatch && method === "PUT") {
    const id = parseInt(mapLocationUpdateMatch[1]);
    const allLocKeys = Object.keys(localStorage).filter((k) =>
      k.startsWith("vmap_locations_"),
    );
    for (const k of allLocKeys) {
      const locs = JSON.parse(localStorage.getItem(k) || "[]");
      const idx = locs.findIndex((l) => l.id === id);
      if (idx > -1) {
        locs[idx].x = body?.x ?? locs[idx].x;
        locs[idx].y = body?.y ?? locs[idx].y;
        localStorage.setItem(k, JSON.stringify(locs));
        break;
      }
    }
    return mockResponse({ success: true });
  }

  // 记录到达
  if (url === "/api/location-log" && method === "POST") {
    const { ownerType, ownerId, locationName } = body || {};
    const key =
      ownerType === "persona"
        ? `vlogs_persona_${ownerId}`
        : `vlogs_user_${ownerId}`;
    const logs = JSON.parse(localStorage.getItem(key) || "[]");
    logs.unshift({
      id: Date.now(),
      location_name: locationName,
      arrived_at: new Date().toISOString(),
    });
    // 只保留最近 50 条
    localStorage.setItem(key, JSON.stringify(logs.slice(0, 50)));
    return mockResponse({ success: true });
  }

  // 读取到达记录（角色）
  const locationLogsPersonaMatch = url.match(
    /^\/api\/location-logs\/persona\/(.+)$/,
  );
  if (locationLogsPersonaMatch && method === "GET") {
    const id = locationLogsPersonaMatch[1];
    const logs = JSON.parse(
      localStorage.getItem(`vlogs_persona_${id}`) || "[]",
    );
    return mockResponse(logs);
  }

  // 读取到达记录（用户）
  const locationLogsUserMatch = url.match(/^\/api\/location-logs\/user\/(.+)$/);
  if (locationLogsUserMatch && method === "GET") {
    const id = locationLogsUserMatch[1];
    const logs = JSON.parse(localStorage.getItem(`vlogs_user_${id}`) || "[]");
    return mockResponse(logs);
  }

  // AI 生成地图（调副 API 生成 SVG）
  if (url === "/api/map-generate" && method === "POST") {
    const { prompt, style } = body || {};
    if (!prompt) return mockResponse({ error: "请描述地图场景" });
    const config = getSubApiConfig();
    if (!config.apiKey) return mockResponse({ error: "未配置副 API" });

    const styleMap = {
      cute: "可爱插画风格，柔和的色彩，圆润的线条，温馨感",
      fantasy: "奇幻手绘风格，细腻的纹理，魔法氛围",
      minimal: "简约线稿风格，黑白或单色，几何感",
    };
    const styleDesc = styleMap[style] || styleMap.cute;

    const mapPrompt = `生成一张虚拟地图的 SVG 代码。

场景：${prompt}
风格：${styleDesc}

要求：
- viewBox="0 0 800 600"
- 包含道路、建筑、地标
- 用柔和颜色：#FFE9ED, #E8C0C9, #D9A3AF, #98CBEA
- 地点用 <text> 标注中文名
- 只输出 <svg>...</svg>，不要任何解释`;

    try {
      const res = await fetchAI(
        config,
        [{ role: "user", content: mapPrompt }],
        { max_tokens: 2000, temperature: 0.8 },
      );
      const { ok, data } = await parseAIResponse(res);
      if (!ok || !data) return mockResponse({ error: "生成失败" });
      const text = data.choices?.[0]?.message?.content?.trim() || "";
      const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
      if (!svgMatch) return mockResponse({ error: "未生成有效的 SVG" });
      const svgCode = svgMatch[0];
      // 转成 data URL 直接用
      const encoded = btoa(unescape(encodeURIComponent(svgCode)));
      return mockResponse({ url: `data:image/svg+xml;base64,${encoded}` });
    } catch (e) {
      return mockResponse({ error: e.message });
    }
  }

  // ========== 世界书 ==========
  if (url === "/api/worldbooks" && method === "GET") {
    const data = localStorage.getItem("local_worldbooks");
    return mockResponse(data ? JSON.parse(data) : []);
  }
  if (url === "/api/worldbooks" && method === "POST") {
    const books = JSON.parse(localStorage.getItem("local_worldbooks") || "[]");
    const newBook = {
      ...body,
      id: Date.now(),
      enabled: true,
      created_at: new Date().toISOString(),
    };
    books.push(newBook);
    localStorage.setItem("local_worldbooks", JSON.stringify(books));
    return mockResponse(newBook);
  }
  if (url === "/api/worldbooks/compress" && method === "POST") {
    const content = body?.content || "";
    const title = body?.title || "";
    if (!content) return mockResponse({ error: "内容为空" });
    const config = getSubApiConfig();
    if (!config.apiKey) return mockResponse({ error: "未配置副 API" });
    const prompt = `将以下世界书内容压缩成不超过300字的核心摘要。
标题：${title}
保留：关键人物/地点/规则/限制条件/核心设定。
删除：冗余描述、举例说明、重复内容。
只输出压缩后的内容，不加标题和解释：

${content.slice(0, 4000)}`;
    try {
      const res = await fetchAI(config, [{ role: "user", content: prompt }], {
        max_tokens: 500,
      });
      const { ok, data } = await parseAIResponse(res);
      if (!ok || !data) return mockResponse({ error: "压缩失败" });
      return mockResponse({
        compressed: data.choices?.[0]?.message?.content?.trim() || "",
      });
    } catch (e) {
      return mockResponse({ error: e.message });
    }
  }
  if (url === "/api/worldbooks/bind" && method === "POST") {
    const { bookIds, bindType, bindPersonas } = body || {};
    const books = JSON.parse(localStorage.getItem("local_worldbooks") || "[]");
    books.forEach((b) => {
      if (bookIds?.includes(b.id)) {
        b.bindType = bindType || "global";
        b.bindPersonas = bindPersonas || "";
      }
    });
    localStorage.setItem("local_worldbooks", JSON.stringify(books));
    return mockResponse({ success: true });
  }
  if (url === "/api/worldbooks/categorize" && method === "POST") {
    const { bookIds, category } = body || {};
    const books = JSON.parse(localStorage.getItem("local_worldbooks") || "[]");
    books.forEach((b) => {
      if (bookIds?.includes(b.id)) b.category = category;
    });
    localStorage.setItem("local_worldbooks", JSON.stringify(books));
    return mockResponse({ success: true });
  }
  const wbToggleMatch = url.match(/^\/api\/worldbooks\/(\d+)\/toggle$/);
  if (wbToggleMatch && method === "POST") {
    const id = parseInt(wbToggleMatch[1]);
    const books = JSON.parse(localStorage.getItem("local_worldbooks") || "[]");
    const idx = books.findIndex((b) => b.id === id);
    if (idx > -1) books[idx].enabled = body?.enabled !== false;
    localStorage.setItem("local_worldbooks", JSON.stringify(books));
    return mockResponse({ success: true });
  }
  const wbMatch = url.match(/^\/api\/worldbooks\/(\d+)$/);
  if (wbMatch && method === "PUT") {
    const id = parseInt(wbMatch[1]);
    const books = JSON.parse(localStorage.getItem("local_worldbooks") || "[]");
    const idx = books.findIndex((b) => b.id === id);
    if (idx > -1) books[idx] = { ...books[idx], ...body };
    localStorage.setItem("local_worldbooks", JSON.stringify(books));
    return mockResponse({ success: true });
  }
  if (wbMatch && method === "DELETE") {
    const id = parseInt(wbMatch[1]);
    const books = JSON.parse(localStorage.getItem("local_worldbooks") || "[]");
    localStorage.setItem(
      "local_worldbooks",
      JSON.stringify(books.filter((b) => b.id !== id)),
    );
    return mockResponse({ success: true });
  }

  // ========== 备忘录 AI 生成（副 API）==========
  if (url.includes("/api/memo/ai-generate/") && method === "POST") {
    const pid = url.split("/api/memo/ai-generate/")[1];
    const config = getSubApiConfig();
    if (!config.apiKey) {
      return mockResponse({
        memo: {
          title: "未配置",
          content: "请先在设置中配置 API Key",
          tags: [],
          color: "rgba(255,255,255,0.45)",
        },
      });
    }

    const [msgs, memoryContext, personas] = await Promise.all([
      storage.getMessages(pid),
      storage.buildMemoryContext(pid),
      getAllPersonas(),
    ]);
    const persona = personas.find((p) => p.id === pid);
    const personaName = persona?.note || persona?.name || "TA";
    const callUser = persona?.call_user || "你";
    const now = new Date();
    const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;

    const recentContext = msgs
      .slice(-10)
      .map((m) => `${m.role === "user" ? callUser : personaName}: ${m.content}`)
      .join("\n");

    const prompt = `你是${personaName}，现在是${dateStr}。

你们最近的对话：
${recentContext || "（还没有对话）"}

关于用户你知道的：
${memoryContext || "（还没有记忆）"}

请以${personaName}的第一人称，写一条今天的碎片备忘录。
这条备忘录是你留给自己看的私人记录，可以是：
- 今天和用户聊天后的感受或心情
- 你注意到的用户的某个细节
- 某个想法、或者突然想起的什么
- 对今天这段时光的简短感想

要求：
- 语气自然，像真实日记
- 50-100字
- 不要用"用户"这个词，用对方的称呼或"你"
- 可以配1-2个标签

只返回 JSON：
{
  "title": "简短标题（可选，10字内）",
  "content": "备忘录内容",
  "tags": ["标签1"],
  "color": "rgba(255,233,237,0.9)"
}`;

    try {
      const res = await fetchAI(config, [{ role: "user", content: prompt }], {
        max_tokens: 300,
      });
      const { ok, data } = await parseAIResponse(res);
      if (!ok || !data) throw new Error("请求失败");
      const text = data.choices?.[0]?.message?.content?.trim() || "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("格式错误");
      return mockResponse({ memo: JSON.parse(match[0]) });
    } catch {
      return mockResponse({
        memo: {
          title: dateStr,
          content: "今天和你聊了一会儿，有些话没说出口，但心里记着呢。",
          tags: ["碎片"],
          color: "rgba(255,233,237,0.9)",
        },
      });
    }
  }

  // ========== 人设状态/日程 ==========
  const statusMatch = url.match(/^\/api\/persona-status\/(.+)$/);
  if (statusMatch && method === "GET") {
    const id = statusMatch[1];
    const saved = localStorage.getItem(`persona_status_${id}`);
    return mockResponse(
      saved ? JSON.parse(saved) : { status: "available", reason: "" },
    );
  }
  if (statusMatch && method === "POST") {
    const id = statusMatch[1];
    localStorage.setItem(`persona_status_${id}`, JSON.stringify(body));
    return mockResponse({ success: true });
  }

  const scheduleMatch = url.match(/^\/api\/persona-schedules\/(.+)$/);
  if (scheduleMatch && method === "GET") {
    const id = scheduleMatch[1];
    const data = JSON.parse(localStorage.getItem(`schedules_${id}`) || "[]");
    return mockResponse(data);
  }
  if (scheduleMatch && method === "POST") {
    const id = scheduleMatch[1];
    const schedules = JSON.parse(
      localStorage.getItem(`schedules_${id}`) || "[]",
    );
    const newItem = { ...body, id: Date.now(), enabled: true };
    schedules.push(newItem);
    localStorage.setItem(`schedules_${id}`, JSON.stringify(schedules));
    return mockResponse(newItem);
  }
  if (scheduleMatch && method === "PUT") {
    const id = scheduleMatch[1];
    // PUT 到 /api/persona-schedules/:scheduleId，body 有 enabled
    const allKeys = Object.keys(localStorage).filter((k) =>
      k.startsWith("schedules_"),
    );
    for (const k of allKeys) {
      const items = JSON.parse(localStorage.getItem(k) || "[]");
      const idx = items.findIndex((s) => String(s.id) === id);
      if (idx > -1) {
        items[idx] = { ...items[idx], ...body };
        localStorage.setItem(k, JSON.stringify(items));
        break;
      }
    }
    return mockResponse({ success: true });
  }
  if (scheduleMatch && method === "DELETE") {
    const id = scheduleMatch[1];
    const allKeys = Object.keys(localStorage).filter((k) =>
      k.startsWith("schedules_"),
    );
    for (const k of allKeys) {
      const items = JSON.parse(localStorage.getItem(k) || "[]");
      const filtered = items.filter((s) => String(s.id) !== id);
      if (filtered.length !== items.length) {
        localStorage.setItem(k, JSON.stringify(filtered));
        break;
      }
    }
    return mockResponse({ success: true });
  }

  if (url.includes("/api/persona-schedules/")) return mockResponse([]);

  // ========== 日历事件 ==========
  if (url === "/api/calendar-events" && method === "GET")
    return mockResponse([]);
  if (url === "/api/calendar-events" && method === "POST")
    return mockResponse({ success: true });

  // ========== 测试连接 ==========
  if (url === "/api/test/models" && method === "POST") {
    const { baseUrl, key } = body || {};
    if (!key) return mockResponse({ error: "请先配置 API Key" });
    if (!baseUrl) return mockResponse({ error: "请先配置 API 地址" });
    try {
      const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      return mockResponse(await res.json());
    } catch (e) {
      return mockResponse({ error: e.message });
    }
  }
  if (url === "/api/test/connection" && method === "POST") {
    const { baseUrl, key, model } = body || {};
    if (!key) return mockResponse({ error: "请先配置 API Key" });
    if (!baseUrl) return mockResponse({ error: "请先配置 API 地址" });
    try {
      const res = await fetch(
        `${baseUrl.replace(/\/+$/, "")}/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 5,
          }),
        },
      );
      return mockResponse({ ok: res.ok, data: await res.json() });
    } catch (e) {
      return mockResponse({ error: e.message });
    }
  }

  // ========== 主动消息设置 ==========
  if (url === "/api/proactive/settings" && method === "GET") {
    const data = localStorage.getItem("local_proactive_settings");
    return mockResponse(
      data
        ? JSON.parse(data)
        : {
            enabled: false,
            intervalValue: 4,
            intervalUnit: "hours",
            maxPerDay: 3,
            idleHours: 12,
            enabledPersonas: [],
          },
    );
  }
  if (url === "/api/proactive/settings" && method === "POST") {
    localStorage.setItem("local_proactive_settings", JSON.stringify(body));
    return mockResponse({ success: true });
  }

  // ========== 用户偏好 ==========
  if (url === "/api/prompts/user" && method === "GET") {
    return mockResponse({
      content: localStorage.getItem("local_user_prompt") || "",
      template: "",
    });
  }
  if (url === "/api/prompts/user" && method === "POST") {
    localStorage.setItem("local_user_prompt", body?.content || "");
    return mockResponse({ success: true });
  }

  // ========== 导出 ==========
  if (url === "/api/export")
    return mockResponse({ personas: await getAllPersonas() });

  // ========== 沉淀规则 ==========
  const sedRulesMatch = url.match(/^\/api\/sediment-rules\/(.+)$/);
  if (sedRulesMatch && method === "GET") {
    const data = localStorage.getItem(`sediment_rules_${sedRulesMatch[1]}`);
    return mockResponse(data ? JSON.parse(data) : {});
  }
  if (sedRulesMatch && method === "POST") {
    localStorage.setItem(
      `sediment_rules_${sedRulesMatch[1]}`,
      JSON.stringify(body),
    );
    return mockResponse({ success: true });
  }

  if (url === "/api/settings/memory-config" && method === "POST") {
    localStorage.setItem("memory_manage_config", JSON.stringify(body));
    return mockResponse({ success: true });
  }
  if (url === "/api/settings/memory-config" && method === "GET") {
    const data = localStorage.getItem("memory_manage_config");
    return mockResponse(data ? JSON.parse(data) : {});
  }

  if (url === "/api/contact-groups") return mockResponse([]);

  if (url === "/api/stats/monthly-tokens-all") {
    const month = new Date().toISOString().slice(0, 7);
    const data = JSON.parse(
      localStorage.getItem(`monthly_tokens_${month}`) ||
        '{"total":0,"msgCount":0}',
    );
    return mockResponse(data);
  }

  // ========== 日记 ==========
  if (url.startsWith("/api/diary/user") && method === "GET") {
    const data = JSON.parse(localStorage.getItem("diary_user") || "[]");
    return mockResponse(
      data.sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    );
  }

  const diaryAiMatch = url.match(/^\/api\/diary\/ai(\?.*)?$/);
  if (diaryAiMatch && method === "GET") {
    const pid =
      new URLSearchParams(url.split("?")[1] || "").get("persona") ||
      localStorage.getItem("last_chat_persona") ||
      "xiaorou";
    const data = JSON.parse(localStorage.getItem(`diary_ai_${pid}`) || "[]");
    return mockResponse(
      data.sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    );
  }

  if (url === "/api/diary/write" && method === "POST") {
    const key =
      body?.type === "ai"
        ? `diary_ai_${body.personaId || localStorage.getItem("last_chat_persona") || "xiaorou"}`
        : "diary_user";
    const existing = JSON.parse(localStorage.getItem(key) || "[]");

    // AI 日记同天去重
    if (body?.type === "ai" && body?.date) {
      const sameDay = existing.findIndex((d) => d.date === body.date);
      if (sameDay > -1)
        existing[sameDay] = {
          ...existing[sameDay],
          ...body,
          id: existing[sameDay].id,
        };
      else
        existing.unshift({
          id: Date.now().toString(),
          ...body,
          created_at: new Date().toISOString(),
        });
    } else {
      existing.unshift({
        id: Date.now().toString(),
        ...body,
        created_at: new Date().toISOString(),
      });
    }

    localStorage.setItem(key, JSON.stringify(existing));
    return mockResponse({ success: true });
  }

  const diaryAiGenMatch = url.match(/^\/api\/diary\/ai-generate\/([^\/]+)$/);
  if (diaryAiGenMatch && method === "POST") {
    const pid = diaryAiGenMatch[1];
    const config = getSubApiConfig();
    if (!config.apiKey)
      return mockResponse({ entry: null, error: "未配置副 API" });

    const personas = await getAllPersonas();
    const persona = personas.find((p) => p.id === pid);
    const personaName = persona?.note || persona?.name || "TA";
    const msgs = await storage.getMessages(pid);
    const today = body?.date || new Date().toISOString().slice(0, 10);

    const todayMsgs = msgs
      .filter((m) => m.timestamp && m.timestamp.slice(0, 10) === today)
      .slice(-20);

    if (todayMsgs.length === 0) {
      return mockResponse({ entry: null, error: "今天还没有对话" });
    }

    const chatContext = todayMsgs
      .map(
        (m) =>
          `${m.role === "user" ? persona?.call_user || "你" : personaName}: ${m.content}`,
      )
      .join("\n");

    const userDiarySection =
      body?.readUserDiary && body?.userDiaryContent
        ? `\n用户今天写的日记：\n${body.userDiaryContent}\n`
        : "";

    const prompt = `你是${personaName}，今天是${today}。

今天你们的对话：
${chatContext}
${userDiarySection}
请以${personaName}的第一人称，写一篇今天的私人日记。

要求：
- 真实的情感流露，像真实的日记，不是总结
- 可以有疑惑、开心、失落、期待等真实情绪
- 150-300字
- 不要用"用户"，用"你"或对方的称呼
- 如果读了用户的日记，可以有呼应但不要直接引用

只返回 JSON：
{
  "title": "日记标题（简短，10字内）",
  "content": "日记正文"
}`;

    try {
      const res = await fetchAI(config, [{ role: "user", content: prompt }], {
        max_tokens: 500,
      });
      const { ok, data } = await parseAIResponse(res);
      if (!ok || !data) return mockResponse({ entry: null, error: "生成失败" });
      const text = data.choices?.[0]?.message?.content?.trim() || "";
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) return mockResponse({ entry: null, error: "格式错误" });
      const result = JSON.parse(match[0]);
      return mockResponse({ entry: result });
    } catch (e) {
      return mockResponse({ entry: null, error: e.message });
    }
  }

  const diaryEditMatch = url.match(/^\/api\/diary\/([^\/]+)$/);
  if (diaryEditMatch && method === "PUT") {
    const id = diaryEditMatch[1];
    // 在所有日记里找这个 id
    const allKeys = Object.keys(localStorage).filter((k) =>
      k.startsWith("diary_"),
    );
    for (const key of allKeys) {
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      const idx = list.findIndex((d) => d.id === id);
      if (idx > -1) {
        list[idx] = { ...list[idx], ...body };
        localStorage.setItem(key, JSON.stringify(list));
        break;
      }
    }
    return mockResponse({ success: true });
  }
  if (diaryEditMatch && method === "DELETE") {
    const id = diaryEditMatch[1];
    const allKeys = Object.keys(localStorage).filter((k) =>
      k.startsWith("diary_"),
    );
    for (const key of allKeys) {
      const list = JSON.parse(localStorage.getItem(key) || "[]");
      const filtered = list.filter((d) => d.id !== id);
      if (filtered.length !== list.length) {
        localStorage.setItem(key, JSON.stringify(filtered));
        break;
      }
    }
    return mockResponse({ success: true });
  }

  // ========== 外卖/快递 ==========
  if (url === "/api/delivery" && method === "POST")
    return mockResponse({ success: true });
  if (url.includes("/api/transfers/")) return mockResponse({ success: true });

  const giftMatch = url.match(/^\/api\/gifts\/(.+)$/);
  if (giftMatch && method === "POST") {
    const pid = giftMatch[1];
    const existing = JSON.parse(
      localStorage.getItem(`wallet_${pid}`) ||
        '{"balance":0,"transfers":[],"gifts":[]}',
    );
    existing.gifts = existing.gifts || [];
    existing.gifts.unshift({
      id: Date.now(),
      ...body,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(`wallet_${pid}`, JSON.stringify(existing));
    return mockResponse({ success: true });
  }
  if (giftMatch && method === "GET") {
    const data = JSON.parse(
      localStorage.getItem(`wallet_${giftMatch[1]}`) ||
        '{"balance":0,"transfers":[],"gifts":[]}',
    );
    return mockResponse(data.gifts || []);
  }

  if (url === "/api/messages/update-meta" && method === "POST")
    return mockResponse({ success: true });

  const walletMatch = url.match(/^\/api\/wallet\/(.+)$/);
  if (walletMatch && method === "GET") {
    const data = JSON.parse(
      localStorage.getItem(`wallet_${walletMatch[1]}`) ||
        '{"balance":0,"transfers":[],"gifts":[]}',
    );
    return mockResponse(data);
  }
  if (walletMatch && method === "POST") {
    const pid = walletMatch[1];
    const existing = JSON.parse(
      localStorage.getItem(`wallet_${pid}`) ||
        '{"balance":0,"transfers":[],"gifts":[]}',
    );
    const amount = parseFloat(body?.amount || 0);
    const direction = body?.direction || "ai_to_user";
    if (direction === "ai_to_user") existing.balance += amount;
    else existing.balance = Math.max(0, existing.balance - amount);
    existing.transfers = existing.transfers || [];
    existing.transfers.unshift({
      id: Date.now(),
      direction,
      amount,
      note: body?.note || "",
      created_at: new Date().toISOString(),
    });
    localStorage.setItem(`wallet_${pid}`, JSON.stringify(existing));
    return mockResponse({ success: true });
  }

  const samplesMatch = url.match(/^\/api\/samples\/([^\/]+)$/);
  if (samplesMatch && method === "GET") {
    const { getLocalSamples } = await import("./localMemory.js");
    return mockResponse(getLocalSamples(samplesMatch[1]));
  }
  if (samplesMatch && method === "POST") {
    const pid = samplesMatch[1];
    const { getLocalSamples } = await import("./localMemory.js");
    const samples = getLocalSamples(pid);
    const newItem = {
      id: Date.now(),
      ...body,
      created_at: new Date().toISOString(),
    };
    samples.unshift(newItem);
    localStorage.setItem(
      `samples_${pid}`,
      JSON.stringify(samples.slice(0, 200)),
    );
    return mockResponse(newItem);
  }
  const sampleDelMatch = url.match(/^\/api\/samples\/item\/(.+)$/);
  if (sampleDelMatch && method === "DELETE") {
    const id = parseInt(sampleDelMatch[1]);
    const { deleteLocalSample } = await import("./localMemory.js");
    Object.keys(localStorage)
      .filter((k) => k.startsWith("samples_"))
      .forEach((k) => {
        deleteLocalSample(k.replace("samples_", ""), id);
      });
    return mockResponse({ success: true });
  }

  const patternsMatch = url.match(/^\/api\/patterns\/(.+)$/);
  if (patternsMatch) {
    const msgs = await storage.getMessages(patternsMatch[1]);
    const userMsgs = msgs.filter((m) => m.role === "user");
    if (userMsgs.length === 0) return mockResponse([]);

    // 只看最近30天
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const recentMsgs = userMsgs.filter(
      (m) => m.timestamp && new Date(m.timestamp) >= cutoff,
    );
    if (recentMsgs.length === 0) return mockResponse([]);

    const patterns = [];

    // 深夜聊天：按天去重，至少3天
    const lateNightDates = new Set(
      recentMsgs
        .filter((m) => {
          const h = new Date(m.timestamp).getHours();
          return h >= 23 || h <= 3;
        })
        .map((m) => new Date(m.timestamp).toISOString().slice(0, 10)),
    );
    if (lateNightDates.size >= 3) {
      patterns.push({
        pattern_type: "late_night",
        description: "习惯深夜聊天",
        frequency: lateNightDates.size,
      });
    }

    // 负面情绪：按天去重，至少3天
    const negativeWords = [
      "累",
      "烦",
      "难受",
      "崩溃",
      "郁闷",
      "孤独",
      "难过",
      "压力",
      "焦虑",
      "失眠",
      "伤心",
      "生气",
      "委屈",
      "心疼",
      "痛",
    ];
    const negativeDates = new Set(
      recentMsgs
        .filter((m) => negativeWords.some((w) => m.content.includes(w)))
        .map((m) => new Date(m.timestamp).toISOString().slice(0, 10)),
    );
    if (negativeDates.size >= 3) {
      patterns.push({
        pattern_type: "emotion_negative",
        description: "情绪容易低落",
        frequency: negativeDates.size,
      });
    }

    // 正面情绪：按天去重，至少3天
    const positiveWords = [
      "开心",
      "高兴",
      "哈哈",
      "太好了",
      "棒",
      "爽",
      "兴奋",
    ];
    const positiveDates = new Set(
      recentMsgs
        .filter((m) => positiveWords.some((w) => m.content.includes(w)))
        .map((m) => new Date(m.timestamp).toISOString().slice(0, 10)),
    );
    if (positiveDates.size >= 3) {
      patterns.push({
        pattern_type: "emotion_positive",
        description: "心情好的时候很活跃",
        frequency: positiveDates.size,
      });
    }

    // 长消息：至少5条且占比超30%
    const longMsgs = recentMsgs.filter((m) => m.content.length > 100);
    if (longMsgs.length >= 5 && longMsgs.length / recentMsgs.length > 0.3) {
      patterns.push({
        pattern_type: "long_message",
        description: "喜欢详细表达",
        frequency: longMsgs.length,
      });
    }

    // 短消息：按天统计，至少5天的平均长度 < 15
    // 不能用总消息数，改成：短消息占比 > 60% 且至少跨3天
    const shortMsgDates = new Set(
      recentMsgs
        .filter((m) => m.content.length < 10 && m.content.length > 1)
        .map((m) => new Date(m.timestamp).toISOString().slice(0, 10)),
    );
    const avgLen =
      recentMsgs.reduce((s, m) => s + m.content.length, 0) / recentMsgs.length;
    if (avgLen < 15 && shortMsgDates.size >= 3) {
      patterns.push({
        pattern_type: "short_message",
        description: "习惯简短表达",
        frequency: shortMsgDates.size,
      });
    }

    // 高频聊天：最近7天中有5天以上有消息
    const day7 = new Date();
    day7.setDate(day7.getDate() - 7);
    const recentDates = new Set(
      recentMsgs
        .filter((m) => m.timestamp && new Date(m.timestamp) >= day7)
        .map((m) => m.timestamp.slice(0, 10)),
    );
    if (recentDates.size >= 5) {
      patterns.push({
        pattern_type: "high_frequency",
        description: "近期几乎每天都来",
        frequency: recentDates.size,
      });
    }

    // 亲密表达：按天去重，至少3天
    const intimateWords = [
      "想你",
      "爱你",
      "抱抱",
      "亲",
      "喜欢你",
      "在吗",
      "陪我",
    ];
    const intimateDates = new Set(
      recentMsgs
        .filter((m) => intimateWords.some((w) => m.content.includes(w)))
        .map((m) => new Date(m.timestamp).toISOString().slice(0, 10)),
    );
    if (intimateDates.size >= 3) {
      patterns.push({
        pattern_type: "intimate",
        description: "情感表达直接丰富",
        frequency: intimateDates.size,
      });
    }

    return mockResponse(
      patterns.sort((a, b) => b.frequency - a.frequency).slice(0, 6),
    );
  }

  // ========== 单条消息操作 ==========
  const singleMsgMatch = url.match(/^\/api\/message\/(.+)$/);
  if (singleMsgMatch && method === "DELETE") {
    const msgId = singleMsgMatch[1];
    const personas = await getAllPersonas();
    for (const p of personas) {
      const msgs = await storage.getMessages(p.id);
      const filtered = msgs.filter((m) => String(m.id) !== String(msgId));
      if (filtered.length !== msgs.length) {
        await storage.saveMessages(p.id, filtered);
        break;
      }
    }
    return mockResponse({ success: true });
  }
  if (singleMsgMatch && method === "PUT") {
    const msgId = singleMsgMatch[1];
    const personas = await getAllPersonas();
    for (const p of personas) {
      const msgs = await storage.getMessages(p.id);
      const idx = msgs.findIndex((m) => String(m.id) === String(msgId));
      if (idx > -1) {
        msgs[idx].content = body?.content || msgs[idx].content;
        await storage.saveMessages(p.id, msgs);
        break;
      }
    }
    return mockResponse({ success: true });
  }

  // ========== 默认 ==========
  console.log("[LocalAPI] 未处理的请求:", method, url);
  return mockResponse({ success: true });
}
