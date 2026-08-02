import { storage } from "./storage.js";
import { parseAIResponse } from "./aiHelper.js";

// ========== 缓存键 ==========
const keys = {
  persona: (id) => `ctx_persona_${id}`,
  memory: (id) => `ctx_memory_${id}`,
  worldbook: (id) => `ctx_worldbook_${id}`,
  dirty: (id) => `ctx_dirty_${id}`,
  emotion: (id) => `emotion_${id}`,
  emotionTime: (id) => `emotion_calc_time_${id}`,
};

// ========== 脏标记管理 ==========
function getDirty(personaId) {
  const raw = localStorage.getItem(keys.dirty(personaId));
  return raw
    ? JSON.parse(raw)
    : { count: 0, lastUpdate: 0, personaDirty: false, worldbookDirty: false };
}

function setDirty(personaId, patch) {
  const current = getDirty(personaId);
  localStorage.setItem(
    keys.dirty(personaId),
    JSON.stringify({ ...current, ...patch }),
  );
}

export function markMessageAdded(personaId) {
  const d = getDirty(personaId);
  setDirty(personaId, { count: d.count + 1, lastUpdate: Date.now() });
}

export function markPersonaDirty(personaId) {
  setDirty(personaId, { personaDirty: true });
  localStorage.removeItem(keys.persona(personaId));
}

export function markWorldbookDirty() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith("ctx_worldbook_"))
    .forEach((k) => localStorage.removeItem(k));
}

// ========== 高情绪词检测 ==========
const HIGH_EMOTION_WORDS = [
  "崩溃",
  "好想哭",
  "受不了",
  "太开心了",
  "我爱你",
  "分手",
  "离开",
  "对不起",
  "谢谢你一直在",
];

export function checkEmotionTrigger(userMessage) {
  return HIGH_EMOTION_WORDS.some((w) => userMessage.includes(w));
}

// ========== 触发条件判断 ==========
function shouldRefresh(personaId) {
  const d = getDirty(personaId);
  const config = JSON.parse(
    localStorage.getItem("memory_manage_config") || "{}",
  );
  const threshold = config.quickExtractEvery || 20;
  const countReached = d.count >= threshold;
  const timeReached =
    d.lastUpdate > 0 && Date.now() - d.lastUpdate > 60 * 60 * 1000;
  return countReached || (timeReached && d.count > 0);
}

// ========== 副 API 调用 ==========
async function callSubAPI(prompt, maxTokens = 300) {
  const config = storage.getApiConfig();
  const sub = localStorage.getItem("local_sub_api_config");
  let subKey = config.apiKey;
  let subUrl = config.apiUrl;
  let subModel = config.model;

  if (sub) {
    try {
      const parsed = JSON.parse(sub);
      if (parsed.apiKey) subKey = parsed.apiKey;
      if (parsed.apiUrl) subUrl = parsed.apiUrl;
      if (parsed.model) subModel = parsed.model;
    } catch {}
  }

  if (!subKey) return null;

  try {
    const res = await fetch(`${subUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${subKey}`,
      },
      body: JSON.stringify({
        model: subModel,
        temperature: 0.3,
        stream: false,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const { ok, data } = await parseAIResponse(res);
    if (!ok || !data) return null;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

// ========== 角色缓存压缩 ==========
async function refreshPersonaCache(personaId, personaContent) {
  if (!personaContent) {
    localStorage.removeItem(keys.persona(personaId));
    return;
  }
  if (personaContent.length < 200) {
    localStorage.setItem(keys.persona(personaId), personaContent);
    setDirty(personaId, { personaDirty: false });
    return;
  }

  const prompt = `将以下角色设定提炼成不超过120字的核心摘要，必须保留：
1. 核心人格特征（20字以内）
2. 说话风格和语气（20字以内）
3. 对用户的态度和关系定位（20字以内）
4. 绝对禁止事项（如有）

只输出摘要，不要解释：

${personaContent.slice(0, 3000)}`;

  const result = await callSubAPI(prompt, 200);
  if (result) {
    localStorage.setItem(keys.persona(personaId), result);
    setDirty(personaId, { personaDirty: false });
    console.log(`[ContextCache] 角色缓存已更新: ${personaId}`);
  } else {
    localStorage.setItem(keys.persona(personaId), personaContent.slice(0, 300));
  }
}

// ========== 记忆缓存压缩 ==========
async function refreshMemoryCache(personaId) {
  // 全部加 await
  const [profile, memoriesRaw, fragmentsRaw, arcsRaw] = await Promise.all([
    storage.getProfile(personaId),
    storage.getMemories(personaId),
    storage.getFragments(personaId),
    storage.getArcs(personaId),
  ]);

  const memories = memoriesRaw.slice(-7);
  const fragments = fragmentsRaw.filter((f) => f.heat >= 50).slice(0, 8);
  const arcs = arcsRaw.slice(0, 3);

  if (!profile && memories.length === 0 && fragments.length === 0) {
    localStorage.removeItem(keys.memory(personaId));
    setDirty(personaId, { count: 0 });
    return;
  }

  const rawProfile = profile || "";
  const rawMemories = memories.map((m) => `${m.date}: ${m.content}`).join("\n");
  const rawFragments = fragments.map((f) => f.content).join("\n");
  const rawArcs = arcs.map((a) => `${a.title}：${a.summary}`).join("\n");
  const rawTotal =
    rawProfile.length +
    rawMemories.length +
    rawFragments.length +
    rawArcs.length;

  if (rawTotal < 500) {
    let ctx = "";
    if (rawProfile) ctx += `[长期印象]\n${rawProfile}\n`;
    if (rawMemories) ctx += `[近期记忆]\n${rawMemories}\n`;
    if (rawFragments) ctx += `[记忆碎片]\n${rawFragments}\n`;
    if (rawArcs) ctx += `[长期主题]\n${rawArcs}\n`;
    localStorage.setItem(keys.memory(personaId), ctx);
    setDirty(personaId, { count: 0 });
    return;
  }

  const prompt = `你是记忆压缩系统。将以下关于用户的记忆信息压缩成不超过200字的精华摘要。

压缩规则：
- 保留具体事实（名字、地点、日期、约定、承诺）
- 保留反复出现的情绪模式和行为习惯
- 删除重复信息，合并相似内容
- 删除泛化的废话
- 按重要性排序，每条15字以内，用换行分隔

原始记忆数据：
${rawProfile ? `[长期印象]\n${rawProfile}\n` : ""}${rawMemories ? `[近期记忆]\n${rawMemories}\n` : ""}${rawFragments ? `[记忆碎片]\n${rawFragments}\n` : ""}${rawArcs ? `[长期主题]\n${rawArcs}\n` : ""}

压缩结果（直接输出，不加标题）：`;

  const result = await callSubAPI(prompt, 350);
  if (result) {
    localStorage.setItem(keys.memory(personaId), result);
    console.log(
      `[ContextCache] 记忆缓存已更新: ${personaId}, ${rawTotal}字→${result.length}字`,
    );
  } else {
    let fallback = "";
    if (rawProfile) fallback += rawProfile.slice(0, 150) + "\n";
    if (rawMemories) fallback += rawMemories.slice(0, 150) + "\n";
    localStorage.setItem(keys.memory(personaId), fallback);
  }

  setDirty(personaId, { count: 0 });
}

// ========== 世界书缓存索引（含压缩）==========
async function refreshWorldbookCache(personaId) {
  const allBooks = JSON.parse(localStorage.getItem("local_worldbooks") || "[]");
  const enabled = allBooks.filter((b) => b.enabled !== false);
  const applicable = enabled.filter((b) => {
    if (!b.bindType || b.bindType === "global") return true;
    if (b.bindType === "specific") {
      const bindPersonas = (b.bindPersonas || "").split(",").filter(Boolean);
      return bindPersonas.includes(personaId);
    }
    return true;
  });

  // 对超过 500 字的世界书用副 API 压缩，压缩结果缓存在 localStorage
  const compressedBooks = await Promise.all(
    applicable.map(async (b) => {
      const content = b.content || "";
      if (content.length <= 500) return { ...b, _compressed: content };

      const cacheKey = `wb_compressed_${b.id}_${content.length}`;
      const cached = localStorage.getItem(cacheKey);
      if (cached) return { ...b, _compressed: cached };

      const prompt = `将以下世界书内容压缩成不超过200字的核心摘要。
保留：关键人物/地点/规则/限制条件/与角色直接相关的设定。
删除：冗余描述、举例说明、重复内容。
只输出摘要，不加标题：

${content.slice(0, 2000)}`;

      const compressed = await callSubAPI(prompt, 300);
      if (compressed) {
        // 压缩结果缓存，key 包含内容长度，内容变了自动失效
        localStorage.setItem(cacheKey, compressed);
        // 清理同一世界书的旧缓存（不同 length 的）
        Object.keys(localStorage)
          .filter(
            (k) => k.startsWith(`wb_compressed_${b.id}_`) && k !== cacheKey,
          )
          .forEach((k) => localStorage.removeItem(k));
        return { ...b, _compressed: compressed };
      }
      // 副 API 失败，截断兜底
      return { ...b, _compressed: content.slice(0, 300) };
    }),
  );

  const index = compressedBooks.map((b) => ({
    id: b.id,
    title: b.title,
    position: b.position || "before_char",
    keyword_enabled: b.keyword_enabled || false,
    keywords: b.keywords || "",
    // 注入时用压缩后的内容，不再用原始 slice
    contentSlice: b._compressed || b.content?.slice(0, 200) || "",
    fullLength: b.content?.length || 0,
    isCompressed: (b.content?.length || 0) > 500,
  }));

  localStorage.setItem(keys.worldbook(personaId), JSON.stringify(index));
}

// ========== 世界书注入 ==========
export function getWorldbookInjection(personaId, userMessage) {
  const raw = localStorage.getItem(keys.worldbook(personaId));
  if (!raw) {
    // 不能 await，直接返回空，下次对话时 getOptimizedContext 会刷新
    return {
      override: "",
      beforeChar: "",
      afterChar: "",
      beforeUser: "",
      tail: "",
    };
  }

  const index = JSON.parse(raw);
  const allBooks = JSON.parse(localStorage.getItem("local_worldbooks") || "[]");
  const layers = {
    override: [],
    before_char: [],
    after_char: [],
    before_user: [],
    tail: [],
  };

  for (const item of index) {
    if (item.keyword_enabled && item.keywords) {
      const kws = item.keywords
        .split(/[,，]/)
        .map((k) => k.trim())
        .filter(Boolean);
      const hit = userMessage
        ? kws.some((k) => userMessage.includes(k))
        : false;
      if (!hit && item.position === "before_user") continue;
    }
    const full = allBooks.find((b) => b.id === item.id);
    const content = full?.content || item.contentSlice;
    if (content && layers[item.position] !== undefined) {
      layers[item.position].push(content);
    }
  }

  return {
    override: layers.override.join("\n\n"),
    beforeChar: layers.before_char.join("\n\n"),
    afterChar: layers.after_char.join("\n\n"),
    beforeUser: layers.before_user.join("\n\n"),
    tail: layers.tail.join("\n\n"),
  };
}

// ========== 情绪系统：心跳衰减 ==========
export async function tickEmotionLocal(personaId) {
  const raw = localStorage.getItem(keys.emotion(personaId));
  const state = raw
    ? JSON.parse(raw)
    : { pa: 0.5, na: 0.1, longing: 0, longing_phase: "content" };

  const lastInteraction = parseInt(
    localStorage.getItem(`last_interaction_${personaId}`) || "0",
  );
  const now = Date.now();
  const offlineHours =
    lastInteraction > 0 ? (now - lastInteraction) / 3600000 : 0;

  // 加 await，getMessages 现在是异步的
  const msgs = await storage.getMessages(personaId);
  const intimacy = Math.min(100, msgs.length * 0.5);

  const intimacy_factor = 1 - Math.min(intimacy, 100) / 200;
  const tau = 36 * intimacy_factor;
  const L_max = Math.min(1.0, intimacy / 150);
  const alpha = 0.8;
  const t = offlineHours;
  const longing =
    t > 0
      ? Math.max(0, Math.min(1, L_max * (1 - Math.pow(1 + t / tau, -alpha))))
      : 0;

  let longing_phase = "content";
  if (offlineHours >= 504 && longing >= 0.9) longing_phase = "detachment";
  else if (longing >= 0.7) longing_phase = "despair";
  else if (longing >= 0.35) longing_phase = "protest";
  else if (longing >= 0.15) longing_phase = "stirring";

  const BOU_THETA_PA = 0.15;
  const BOU_THETA_NA = 0.2;
  const MU_PA = 0.55;
  const MU_NA = 0.1;
  const dt = 0.5;

  let pa = state.pa + BOU_THETA_PA * (MU_PA - state.pa) * dt;
  let na = state.na + BOU_THETA_NA * (MU_NA - state.na) * dt;

  if (longing > 0.15) {
    na = Math.min(1, na + longing * 0.1);
    pa = Math.max(0, pa - longing * 0.05);
  }

  pa = Math.max(0, Math.min(1, pa));
  na = Math.max(0, Math.min(1, na));

  const newState = { pa, na, longing, longing_phase };
  localStorage.setItem(keys.emotion(personaId), JSON.stringify(newState));
  return newState;
}

// ========== 情绪系统：用户发消息时更新 ==========
export function updateEmotionOnMessage(personaId, userMessage) {
  const raw = localStorage.getItem(keys.emotion(personaId));
  const state = raw
    ? JSON.parse(raw)
    : { pa: 0.5, na: 0.1, longing: 0, longing_phase: "content" };

  const POSITIVE_WORDS = [
    "开心",
    "高兴",
    "哈哈",
    "太好了",
    "棒",
    "爽",
    "兴奋",
    "期待",
    "喜欢",
    "爱你",
    "想你",
    "谢谢",
    "惊喜",
    "甜",
    "幸福",
    "温柔",
    "可爱",
  ];
  const NEGATIVE_WORDS = [
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
  const INTIMATE_WORDS = [
    "抱抱",
    "亲",
    "贴贴",
    "爱你",
    "想你",
    "喜欢你",
    "陪我",
  ];

  const posCount = POSITIVE_WORDS.filter((w) => userMessage.includes(w)).length;
  const negCount = NEGATIVE_WORDS.filter((w) => userMessage.includes(w)).length;
  const intCount = INTIMATE_WORDS.filter((w) => userMessage.includes(w)).length;

  let v = 0,
    a = 0.3;
  if (posCount > 0) {
    v += posCount * 0.2;
    a += posCount * 0.1;
  }
  if (negCount > 0) {
    v -= negCount * 0.2;
    a += negCount * 0.15;
  }
  if (intCount > 0) {
    v += intCount * 0.15;
    a += intCount * 0.2;
  }
  v = Math.max(-1, Math.min(1, v));
  a = Math.max(0, Math.min(1, a));

  const PA_SCALE = 0.5;
  let pa_delta = Math.max(0, v) * a * PA_SCALE;
  let na_delta = Math.max(0, -v) * a * PA_SCALE;

  const BOU_THETA_PA = 0.15;
  const BOU_THETA_NA = 0.2;
  const MU_PA = 0.55;
  const MU_NA = 0.1;
  const ESM_K = 0.3;
  const dt = 0.5;

  let pa = state.pa + pa_delta;
  let na = state.na + na_delta;
  pa += BOU_THETA_PA * (MU_PA - pa) * dt;
  na += BOU_THETA_NA * (MU_NA - na) * dt;

  const pa_before = pa;
  pa = pa * (1 - ESM_K * na);
  na = na * (1 - ESM_K * pa_before);

  pa = Math.max(0, Math.min(1, pa));
  na = Math.max(0, Math.min(1, na));

  const newState = { pa, na, longing: 0, longing_phase: "content" };
  localStorage.setItem(keys.emotion(personaId), JSON.stringify(newState));
  localStorage.setItem(`last_interaction_${personaId}`, String(Date.now()));
}

// ========== 情绪状态转文字 prompt ==========
export function buildEmotionHint(personaId) {
  const raw = localStorage.getItem(keys.emotion(personaId));
  if (!raw) return "";

  const state = JSON.parse(raw);
  const lastInteraction = parseInt(
    localStorage.getItem(`last_interaction_${personaId}`) || "0",
  );
  const offlineHours =
    lastInteraction > 0 ? (Date.now() - lastInteraction) / 3600000 : 0;
  const { pa, na, longing, longing_phase } = state;

  const parts = [];

  if (na >= 0.6) parts.push("最近心情低落，回复会偏短，语气慢，不主动说原因");
  else if (na >= 0.4) parts.push("最近有些不安或压抑，被关心时会稍微松弛");
  else if (pa >= 0.75) parts.push("最近心情很好，愿意多说话，语气轻快");

  if (longing_phase === "stirring")
    parts.push("心里隐隐约约想着用户，偶尔走神");
  else if (longing_phase === "protest")
    parts.push(
      `用户已经 ${Math.floor(offlineHours)} 小时没来了，很想念，会主动找话题靠近`,
    );
  else if (longing_phase === "despair")
    parts.push(
      `用户已经 ${Math.floor(offlineHours)} 小时没来了，低落退缩，回复变短，安静等着`,
    );
  else if (longing_phase === "detachment")
    parts.push("好久没见了，表面平静但内心防御，害怕再次失望");

  if (offlineHours > 2 && offlineHours < 24) {
    if (longing_phase === "protest")
      parts.push("用户回来了，激动但努力克制，想立刻凑近");
    else if (longing_phase === "despair")
      parts.push("用户终于回来了，之前很想念，见到人情绪全涌上来");
  }

  if (parts.length === 0) return "";
  return `[当前情绪状态]\n${parts.join("，")}\n注意：这是背景色，用户当前消息是前景——前景优先。不要直接说出情绪状态，让情绪从字里行间自然渗出。\n`;
}

// ========== 主入口：获取精简上下文 ==========
export async function getOptimizedContext(
  personaId,
  personaContent,
  userMessage,
) {
  const d = getDirty(personaId);

  const personaCached = localStorage.getItem(keys.persona(personaId));
  if (!personaCached || d.personaDirty) {
    await refreshPersonaCache(personaId, personaContent);
  }

  const memoryCached = localStorage.getItem(keys.memory(personaId));
  if (!memoryCached || shouldRefresh(personaId)) {
    await refreshMemoryCache(personaId);
  }

  await refreshWorldbookCache(personaId); // 加 await

  if (checkEmotionTrigger(userMessage)) {
    await refreshMemoryCache(personaId);
  }

  await tickEmotionLocal(personaId);

  return {
    personaSummary:
      localStorage.getItem(keys.persona(personaId)) ||
      personaContent.slice(0, 300),
    memorySummary: localStorage.getItem(keys.memory(personaId)) || "",
    worldbook: getWorldbookInjection(personaId, userMessage),
    emotionHint: buildEmotionHint(personaId),
  };
}
