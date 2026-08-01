import { isLocalMode } from "./api.js";

// ========== IndexedDB 初始化 ==========
const DB_NAME = "melt_db";
const DB_VERSION = 1;
const STORES = [
  "messages",
  "memories",
  "fragments",
  "arcs",
  "timeline",
  "insights",
  "bookmarks",
  "personas",
  "profiles",
];

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      STORES.forEach((name) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: "key" });
        }
      });
    };
    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function dbGet(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = (e) => reject(e.target.error);
  });
}

export async function dbSet(store, key, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).put({ key, value });
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbDel(store, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}

// ========== 首次启动数据迁移 ==========
// 把旧 localStorage 大数据搬到 IndexedDB，搬完清掉
export async function migrateFromLocalStorage() {
  const migrated = localStorage.getItem("idb_migrated_v1");
  if (migrated) return;

  const bigKeys = [
    { ls: /^messages_/, store: "messages" },
    { ls: /^memories_/, store: "memories" },
    { ls: /^fragments_/, store: "fragments" },
    { ls: /^arcs_/, store: "arcs" },
    { ls: /^timeline_/, store: "timeline" },
    { ls: /^insights_/, store: "insights" },
    { ls: /^bookmarks_/, store: "bookmarks" },
    { ls: /^local_personas$/, store: "personas" },
    { ls: /^profile_summary_/, store: "profiles" },
  ];

  const allKeys = Object.keys(localStorage);
  for (const lsKey of allKeys) {
    const match = bigKeys.find((b) => b.ls.test(lsKey));
    if (!match) continue;
    try {
      const raw = localStorage.getItem(lsKey);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      await dbSet(match.store, lsKey, parsed);
      localStorage.removeItem(lsKey);
    } catch {}
  }

  localStorage.setItem("idb_migrated_v1", "1");
  console.log("[Storage] 数据迁移完成");
}

// ========== 统一的数据读写接口 ==========
export const storage = {
  // ========== 消息 ==========
  async getMessages(personaId) {
    const data = await dbGet("messages", `messages_${personaId}`);
    return data ?? [];
  },
  async saveMessages(personaId, messages) {
    await dbSet("messages", `messages_${personaId}`, messages);
  },
  async appendMessage(personaId, message) {
    const messages = await this.getMessages(personaId);
    messages.push(message);
    // 超过 500 条只保留最近 300 条
    await this.saveMessages(
      personaId,
      messages.length > 500 ? messages.slice(-300) : messages,
    );
  },

  // ========== 角色 ==========
  async getPersonas() {
    const data = await dbGet("personas", "local_personas");
    return data ?? [];
  },
  async savePersonas(personas) {
    await dbSet("personas", "local_personas", personas);
  },
  async getPersona(id) {
    const personas = await this.getPersonas();
    return personas.find((p) => p.id === id) || null;
  },
  async savePersona(persona) {
    const personas = await this.getPersonas();
    const idx = personas.findIndex((p) => p.id === persona.id);
    if (idx > -1) personas[idx] = persona;
    else personas.push(persona);
    await this.savePersonas(personas);
  },
  async deletePersona(id) {
    const personas = await this.getPersonas();
    await this.savePersonas(personas.filter((p) => p.id !== id));
  },

  // ========== 每日记忆摘要 ==========
  async getMemories(personaId) {
    const data = await dbGet("memories", `memories_${personaId}`);
    return data ?? [];
  },

  async saveMemories(personaId, memories) {
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const trimmed = memories
      .filter((m) => !m.date || m.date >= cutoff)
      .slice(-200);
    await dbSet("memories", `memories_${personaId}`, trimmed);
  },

  async saveMemory(personaId, memory) {
    const memories = await this.getMemories(personaId);
    const today = new Date().toISOString().slice(0, 10);
    const todayIdx = memories.findIndex((m) => m.date === today);
    if (todayIdx > -1) {
      const existing = memories[todayIdx].content
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const incoming = (memory.content || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const merged = [
        ...existing,
        ...incoming.filter((item) => !existing.includes(item)),
      ];
      memories[todayIdx].content = merged.join("\n");
    } else {
      memories.push({
        ...memory,
        id: Date.now(),
        date: today,
        created_at: new Date().toISOString(),
      });
    }
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const trimmed = memories
      .filter((m) => !m.date || m.date >= cutoff)
      .slice(-200);
    await dbSet("memories", `memories_${personaId}`, trimmed);
  },

  // ========== 记忆碎片 ==========
  async getFragments(personaId, includeExpired = false) {
    const data = await dbGet("fragments", `fragments_${personaId}`);
    const fragments = data ?? [];
    // 过期状态实时计算，不需要单独跑维护任务
    const now = Date.now();
    return fragments
      .map((f) => {
        const daysSince =
          (now - new Date(f.updated_at || f.created_at).getTime()) / 86400000;
        let status = "active";
        if (f.heat <= 0) status = "expired";
        else if (daysSince >= 90) status = "expired";
        else if (daysSince >= 30) status = "frozen";
        else if (daysSince >= 14) status = "cooling";
        return { ...f, status };
      })
      .filter((f) => includeExpired || f.status !== "expired");
  },

  async saveFragments(personaId, fragments) {
    const trimmed = fragments
      .filter((f) => f.heat > 0)
      .sort((a, b) => b.heat - a.heat)
      .slice(0, 150);
    await dbSet("fragments", `fragments_${personaId}`, trimmed);
  },

  async addFragment(personaId, content, confidence = 0.8) {
    const fragments = await this.getFragments(personaId, true);
    const existing = fragments.find((f) => f.content === content);
    if (existing) {
      existing.heat = Math.min(300, existing.heat + 30);
      existing.updated_at = new Date().toISOString();
      existing.last_recalled = new Date().toISOString();
      // 被再次提到，置信度小幅上升
      existing.confidence = Math.min(1, (existing.confidence || 0.8) + 0.05);
    } else {
      fragments.push({
        id: Date.now(),
        content,
        heat: 150,
        confidence,
        status: "active",
        source_date: new Date().toISOString().slice(0, 10),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_recalled: null,
        // 星座聚类用，初始为空，后续副 API 填充
        constellation: null,
      });
    }
    await this.saveFragments(personaId, fragments);
  },

  // 碎片被检索时调用，更新 last_recalled 和 heat
  async recallFragment(personaId, fragmentId) {
    const fragments = await this.getFragments(personaId, true);
    const f = fragments.find((f) => f.id === fragmentId);
    if (f) {
      f.last_recalled = new Date().toISOString();
      f.heat = Math.min(300, f.heat + 15);
      f.updated_at = new Date().toISOString();
      await this.saveFragments(personaId, fragments);
    }
  },

  // ========== 弧线 ==========
  async getArcs(personaId) {
    const data = await dbGet("arcs", `arcs_${personaId}`);
    return data ?? [];
  },
  async saveArcs(personaId, arcs) {
    await dbSet("arcs", `arcs_${personaId}`, arcs.slice(0, 10));
  },

  // ========== 时间线 ==========
  async getTimeline(personaId) {
    const data = await dbGet("timeline", `timeline_${personaId}`);
    return data ?? [];
  },
  async addTimelineEvent(personaId, content, tags = "") {
    const timeline = await this.getTimeline(personaId);
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (timeline.some((e) => e.content === content && e.date === today)) return;
    timeline.push({
      id: Date.now(),
      content,
      tags,
      date: today,
      time,
      created_at: now.toISOString(),
    });
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const trimmed = timeline.filter((e) => e.date >= cutoff).slice(-500);
    await dbSet("timeline", `timeline_${personaId}`, trimmed);
  },

  // ========== 长期档案 ==========
  async getProfile(personaId) {
    const data = await dbGet("profiles", `profile_summary_${personaId}`);
    return data ?? "";
  },
  async setProfile(personaId, content) {
    await dbSet("profiles", `profile_summary_${personaId}`, content);
  },

  // ========== 用户偏好（保留 localStorage，轻量）==========
  getUserProfile(key) {
    return localStorage.getItem(`profile_${key}`);
  },
  setUserProfile(key, value) {
    localStorage.setItem(`profile_${key}`, value);
  },

  // ========== API 配置（保留 localStorage）==========
  getApiConfig() {
    const data = localStorage.getItem("local_api_config");
    return data
      ? JSON.parse(data)
      : {
          apiKey: "",
          apiUrl: "https://api.openai.com/v1",
          model: "gpt-4o-mini",
          temperature: 0.7,
        };
  },
  saveApiConfig(config) {
    localStorage.setItem("local_api_config", JSON.stringify(config));
  },

  // ========== 构建给 AI 的记忆上下文 ==========
  async buildMemoryContext(personaId) {
    let context = "";

    const profile = await this.getProfile(personaId);
    if (profile) context += `[长期印象]\n${profile}\n`;

    const memories = (await this.getMemories(personaId)).slice(-7);
    if (memories.length > 0) {
      context += "[近期记忆]\n";
      memories.forEach((m) => {
        context += `${m.date}: ${m.content}\n`;
      });
    }

    const allFragments = await this.getFragments(personaId);
    // 只把高置信度活跃碎片注入 prompt
    const activeFragments = allFragments
      .filter(
        (f) =>
          f.status === "active" && (f.confidence || 0.8) >= 0.7 && f.heat >= 50,
      )
      .slice(0, 8);
    // 冷却中的碎片只供联想，不直接注入（留给星座层用）
    const coolingFragments = allFragments
      .filter((f) => f.status === "cooling" && (f.confidence || 0.8) >= 0.6)
      .slice(0, 4);

    if (activeFragments.length > 0) {
      context += "[记忆碎片]\n";
      activeFragments.forEach((f) => {
        context += `${f.content}\n`;
      });
    }
    if (coolingFragments.length > 0) {
      context += "[模糊印象（仅供参考，不要直接引用）]\n";
      coolingFragments.forEach((f) => {
        context += `${f.content}\n`;
      });
    }

    const arcs = (await this.getArcs(personaId)).slice(0, 3);
    if (arcs.length > 0) {
      context += "[长期主题]\n";
      arcs.forEach((a) => {
        context += `${a.title}：${a.summary}\n`;
      });
    }

    return context;
  },

  // ========== 清理某个角色的所有数据 ==========
  async clearPersonaData(personaId) {
    await Promise.all([
      dbDel("messages", `messages_${personaId}`),
      dbDel("memories", `memories_${personaId}`),
      dbDel("fragments", `fragments_${personaId}`),
      dbDel("arcs", `arcs_${personaId}`),
      dbDel("timeline", `timeline_${personaId}`),
      dbDel("insights", `insights_${personaId}`),
      dbDel("bookmarks", `bookmarks_${personaId}`),
      dbDel("profiles", `profile_summary_${personaId}`),
    ]);
    // 轻量 key 还在 localStorage，一并清
    localStorage.removeItem(`emotion_${personaId}`);
    localStorage.removeItem(`emotion_calc_time_${personaId}`);
    localStorage.removeItem(`ctx_memory_${personaId}`);
    localStorage.removeItem(`ctx_dirty_${personaId}`);
  },
};
