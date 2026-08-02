import { storage } from "./storage.js";
import { parseAIResponse } from "./aiHelper.js";
import { markMessageAdded, checkEmotionTrigger } from "./contextCache.js";

// ========== 副 API 调用 ==========
async function _callAI(prompt, maxTokens = 600) {
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

  if (!subKey) {
    console.warn("[LocalMemory] 未配置 API Key，跳过");
    return null;
  }

  try {
    const response = await fetch(`${subUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${subKey}`,
      },
      body: JSON.stringify({
        model: subModel || "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: maxTokens,
        stream: false,
      }),
    });

    const { ok, data } = await parseAIResponse(response);
    if (!ok || !data) throw new Error("解析失败");
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error("[LocalMemory] AI 调用失败:", e.message);
    return null;
  }
}

// ========== JSON 解析 ==========
function parseJSON(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    return null;
  }
}

// ========== 读取记忆管理配置 ==========
function getCfg() {
  return JSON.parse(localStorage.getItem("memory_manage_config") || "{}");
}

// ========== 碎片衰减 ==========
async function decayFragments(personaId) {
  const fragments = await storage.getFragments(personaId, true); // 包含 expired
  const decayed = fragments.map((f) => {
    // cooling 的衰减更快，frozen 的更慢（快消失了不用浪费）
    const decayRate =
      f.status === "cooling" ? 10 : f.status === "frozen" ? 3 : 5;
    return { ...f, heat: Math.max(0, f.heat - decayRate) };
  });
  await storage.saveFragments(personaId, decayed);
}

// ========== 星图节点存取 ==========
function getGraphNodes(personaId) {
  const raw = localStorage.getItem(`graph_nodes_${personaId}`);
  return raw ? JSON.parse(raw) : [];
}

function saveGraphNodes(personaId, nodes) {
  const trimmed = nodes
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 80);
  localStorage.setItem(`graph_nodes_${personaId}`, JSON.stringify(trimmed));
}

// ========== 语料库存取 ==========
function getSamples(personaId) {
  const raw = localStorage.getItem(`samples_${personaId}`);
  return raw ? JSON.parse(raw) : [];
}

function saveSample(personaId, sample) {
  const samples = getSamples(personaId);
  samples.unshift({
    id: Date.now() + Math.floor(Math.random() * 10000), // 加随机数
    ...sample,
    created_at: new Date().toISOString(),
  });
  localStorage.setItem(
    `samples_${personaId}`,
    JSON.stringify(samples.slice(0, 200)),
  );
}

// ========== 核心：单次批处理调用 ==========
async function runBatch(
  personaId,
  recentMessages,
  userMessage,
  aiReply,
  userName = "对方",
  personaName = "AI",
) {
  const cfg = getCfg();

  const enableTimeline =
    cfg.timelineEnabled !== false && cfg.timelineAutoRecord !== false;
  const enableMemory = cfg.memoryEnabled !== false;
  const enableObserve = cfg.observeEnabled !== false;
  const enableSampler = cfg.samplerEnabled !== false;

  let timelineCooling = false;
  if (enableTimeline) {
    const lastEventTime = localStorage.getItem(`timeline_last_${personaId}`);
    if (lastEventTime && (Date.now() - parseInt(lastEventTime)) / 3600000 < 6) {
      timelineCooling = true;
    }
  }

  const [timelineData, fragmentsData] = await Promise.all([
    storage.getTimeline(personaId),
    storage.getFragments(personaId),
  ]);

  const recentTimeline = timelineData
    .slice(0, 3)
    .map((e) => e.content)
    .join("\n");
  const recentFragments = fragmentsData
    .slice(0, 5)
    .map((f) => f.content)
    .join("\n");
  const existingNodeTitles = getGraphNodes(personaId)
    .slice(0, 10)
    .map((n) => n.title)
    .join("、");

  const existingNodeThemes = getGraphNodes(personaId)
    .slice(0, 10)
    .map((n) => n.theme)
    .join("、");

  const contextLines = recentMessages
    .slice(-8)
    .map(
      (m) =>
        `${m.role === "user" ? userName : personaName}: ${m.content.slice(0, 80)}`,
    )
    .join("\n");

  const enabledParts = [];
  if (enableTimeline && !timelineCooling) enabledParts.push("timeline");
  if (enableMemory) enabledParts.push("memory");
  if (enableObserve) enabledParts.push("fragments");
  if (enableObserve) enabledParts.push("graph_node");
  if (enableSampler) enabledParts.push("corpus");
  // 情绪始终加入批处理
  enabledParts.push("emotion");

  if (enabledParts.length === 0) return null;

  const prompt = `你是一个对话分析系统。分析以下对话，为已启用的功能生成对应内容。

对话上下文：
${contextLines}

最新一条：
${userName}: ${userMessage}
${personaName}: ${aiReply}

---
已启用的功能：${enabledParts.join(", ")}

请严格按以下 JSON 格式输出，只输出 JSON，不要任何解释：

{
${
  enabledParts.includes("timeline")
    ? `  "timeline": {
    "worthy": true/false,
    "content": "纪实描述，不超过25字，禁止修饰词（不值得记录则为null）",
    "tags": "标签（可选）"
  },`
    : '  "timeline": {"worthy": false},'
}
${
  enabledParts.includes("memory")
    ? `  "memory": {
    "worthy": true/false,
    "content": "关于${userName}的1-2条核心信息，每条10字以内，换行分隔（无则为null）"
  },`
    : '  "memory": {"worthy": false},'
}
${
  enabledParts.includes("fragments")
    ? `  "fragments": [
    {"content": "碎片内容（15字内）", "confidence": 0.9}
  ],`
    : '  "fragments": [],'
}
${
  enabledParts.includes("graph_node")
    ? `  "graph_node": {
    "worthy": true/false,
    "title": "节点标题（8字内，精准简洁）",
    "theme": "AI自由打标的主题词（3-5字内）",
    "keywords": ["关键词1", "关键词2"],
    "importance": 1-5的重要度数字,
    "summary": "节点描述（20字内）"
  },`
    : '  "graph_node": {"worthy": false},'
}
${
  enabledParts.includes("corpus")
    ? `  "corpus": {
    "worthy": true/false,
    "items": [
      {"type": "reply", "data": {"user_message": "...", "assistant_reply": "..."}},
      {"type": "trait", "data": {"trait": "...", "description": "..."}},
      {"type": "scene", "data": {"scene": "...", "behavior": ["...", "..."]}},
      {"type": "style", "data": {"relationship_style": ["...", "..."]}}
    ]
  },`
    : '  "corpus": {"worthy": false},'
}
  "emotion": {
    "pa": 正面情绪强度 0-1,
    "na": 负面情绪强度 0-1,
    "longing": 思念强度 0-1,
    "longing_phase": "content|stirring|protest|despair|detachment"
  }
}

判断规则：
- timeline：只记录约定/关系变化/共同经历/习惯形成，禁止修饰词。已有记录：${recentTimeline || "无"}
- memory：只提取值得长期记住的事——重要约定、情感转折、关系里程碑、${userName}说过的触动心弦的话。不记录日常闲聊。每条不超过15字。
- fragments：提取1-3条独立事实，每条带置信度（0.6-1.0，确定的事实给高分，推测或模糊的给低分）。已有碎片：${recentFragments || "无"}，**不要和已有碎片内容重复**
- graph_node：判断这段对话是否有值得作为记忆节点的内容。**标题必须新颖，不能是已有的**：${existingNodeTitles || "无"}。已有主题：${existingNodeThemes || "无"}。标题长度8字内。
- corpus：提取能代表这个AI角色风格的样本，items 只输出本次对话中真正有价值的，没有就空数组
- emotion：根据对话判断${personaName}当前情绪。longing_phase：content=正常, stirring=有离别感, protest=${userName}长时间不回或表达忙碌, despair=态度冷淡, detachment=极少对话或充满负面`;

  const raw = await _callAI(prompt, 900);
  return parseJSON(raw);
}

// ========== 分发批处理结果 ==========
async function dispatchBatchResult(personaId, result) {
  if (!result) return;

  // 情绪（新增）
  if (result.emotion && typeof result.emotion.pa === "number") {
    localStorage.setItem(
      `emotion_${personaId}`,
      JSON.stringify(result.emotion),
    );
    localStorage.setItem(`emotion_calc_time_${personaId}`, String(Date.now()));
    console.log(
      `[LocalMemory] 情绪更新: pa=${result.emotion.pa} na=${result.emotion.na}`,
    );
  }

  // 时间线
  if (result.timeline?.worthy && result.timeline.content) {
    const content = result.timeline.content.trim();
    const tags = result.timeline.tags?.trim() || "";
    const recentTimeline = (await storage.getTimeline(personaId))
      .slice(0, 10) // 改成查前10条而不是3条
      .map((e) => e.content);

    // 加强去重：检查前20个字符
    const isDuplicate = recentTimeline.some(
      (c) => c.slice(0, 15) === content.slice(0, 15),
    );

    if (!isDuplicate) {
      await storage.addTimelineEvent(personaId, content, tags);
      localStorage.setItem(`timeline_last_${personaId}`, String(Date.now()));
      console.log(`[LocalMemory] 时间线: ${content}`);
    } else {
      console.log(`[LocalMemory] 时间线重复，跳过: ${content}`);
    }
  }

  // 每日记忆
  if (result.memory?.worthy && result.memory.content) {
    const content = result.memory.content.trim();
    const existing = await storage.getMemories(personaId);

    // 检查是否已存在相似记忆
    const isDuplicate = existing.some(
      (m) => m.content && m.content.slice(0, 10) === content.slice(0, 10),
    );

    if (!isDuplicate) {
      await storage.saveMemory(personaId, { content });
      console.log(`[LocalMemory] 记忆: ${content.slice(0, 30)}`);
    } else {
      console.log(`[LocalMemory] 记忆重复，跳过: ${content}`);
    }
  }

  // 碎片（增强去重）
  if (Array.isArray(result.fragments) && result.fragments.length > 0) {
    const existing = await storage.getFragments(personaId);

    for (const frag of result.fragments) {
      const content = typeof frag === "string" ? frag : frag.content;
      const confidence =
        typeof frag === "object" ? frag.confidence || 0.8 : 0.8;

      if (!content || content.length < 4) continue;

      // 检查是否已存在相似碎片
      const isDuplicate = existing.some(
        (f) => f.content.slice(0, 8) === content.slice(0, 8),
      );

      if (!isDuplicate) {
        await storage.addFragment(personaId, content, confidence);
      } else {
        console.log(`[LocalMemory] 碎片重复，跳过: ${content}`);
      }
    }
  }

  // 星图节点（增强去重）
  if (result.graph_node?.worthy && result.graph_node.title) {
    const nodes = getGraphNodes(personaId);
    const node = result.graph_node;

    // 检查标题或主题是否已存在
    const existing = nodes.find(
      (n) =>
        n.theme === node.theme ||
        n.title === node.title ||
        n.title.slice(0, 6) === node.title.slice(0, 6), // 前6字相同也认为重复
    );

    if (existing) {
      console.log(`[LocalMemory] 节点重复，更新热度: ${node.title}`);
      existing.heat = Math.min(300, (existing.heat || 100) + 50);
      existing.summary = node.summary || existing.summary;
      existing.updated_at = new Date().toISOString();
    } else {
      console.log(`[LocalMemory] 星图节点: ${node.title} (${node.theme})`);
      nodes.push({
        id: Date.now(),
        title: node.title.slice(0, 20), // 截断到20字以内
        theme: node.theme.slice(0, 10), // 截断主题
        keywords: (node.keywords || []).slice(0, 5),
        importance: Math.min(5, Math.max(1, node.importance || 3)),
        summary: node.summary || "",
        heat: 150,
        linked_themes: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    saveGraphNodes(personaId, nodes);
  }

  // 语料库
  if (result.corpus?.worthy && Array.isArray(result.corpus.items)) {
    const samples = getSamples(personaId);

    for (const item of result.corpus.items) {
      if (!item.type || !item.data) continue;

      // 检查是否已存在相同的样本
      const isDuplicate = samples.some(
        (s) =>
          s.type === item.type &&
          JSON.stringify(s.data).slice(0, 30) ===
            JSON.stringify(item.data).slice(0, 30),
      );

      if (!isDuplicate) {
        saveSample(personaId, { type: item.type, data: item.data });
      }
    }

    if (result.corpus.items.length > 0) {
      console.log(
        `[LocalMemory] 语料: ${result.corpus.items.length} 条（已去重）`,
      );
    }
  }
}

// ========== 星座聚类 + 弧线更新（合并一次副 API）==========
async function updateConstellationsAndArcs(personaId) {
  const fragments = await storage.getFragments(personaId, true);
  const activeFragments = fragments.filter(
    (f) => f.status === "active" || f.status === "cooling",
  );
  if (activeFragments.length < 3) return;

  const existingArcs = await storage.getArcs(personaId);
  const existingConstellations = [
    ...new Set(activeFragments.map((f) => f.constellation).filter(Boolean)),
  ];

  // 找出同一星座下碎片数 >= 3 的，才值得合并叙事
  const constellationGroups = {};
  activeFragments.forEach((f, i) => {
    if (!f.constellation) return;
    if (!constellationGroups[f.constellation])
      constellationGroups[f.constellation] = [];
    constellationGroups[f.constellation].push({
      idx: i,
      content: f.content,
      date: f.source_date,
    });
  });
  const narrativeCandidates = Object.entries(constellationGroups)
    .filter(([, frags]) => frags.length >= 3)
    .map(([name, frags]) => ({ name, frags }));

  const fragmentList = activeFragments
    .slice(0, 40)
    .map((f, i) => `[${i}] ${f.source_date || ""} ${f.content}`)
    .join("\n");

  const narrativeSection =
    narrativeCandidates.length > 0
      ? `\n候选叙事星座（碎片数≥3，可合并）：\n${narrativeCandidates
          .map(
            (c) =>
              `星座「${c.name}」:\n${c.frags.map((f) => `  [${f.idx}] ${f.date} ${f.content}`).join("\n")}`,
          )
          .join("\n")}`
      : "";

  const prompt = `你是一个记忆整理系统。分析以下记忆碎片，完成三项任务。

记忆碎片列表（格式：[序号] 日期 内容）：
${fragmentList}

已有星座分组：${existingConstellations.length > 0 ? existingConstellations.join("、") : "无"}
已有弧线主题：${existingArcs.map((a) => a.title).join("、") || "无"}
${narrativeSection}

---
任务一：星座聚类
把相关的碎片归为同一个星座。星座是关于同一个事/人/地点/话题的碎片集合。
规则：
- 自由命名，不用预设分类
- 孤立的碎片可以不归组（constellation 留 null）
- 已有星座名字尽量复用，不重复建组

任务二：叙事合并
只处理候选叙事星座中的碎片。把时间相近、逻辑连贯的碎片合并成一段完整叙事。
规则：
- 叙事是自然流畅的段落，不是列表，不超过80字
- 没有值得合并的就返回空数组
- 合并后原碎片不删除，只是加上 narrative_id 标记

任务三：弧线提炼
从所有碎片中找出1-2个跨话题的长期主题弧线。
规则：
- 弧线是跨越多个星座的深层模式
- 已有弧线可以更新 summary，不要重复建
- 没有明显弧线就返回空数组

只输出 JSON，不要任何解释：
{
  "constellations": [
    {
      "name": "星座名（5字内）",
      "fragment_indices": [0, 2, 5],
      "summary": "这个星座的一句话描述（20字内）"
    }
  ],
  "narratives": [
    {
      "constellation": "星座名",
      "fragment_indices": [0, 2, 5],
      "content": "合并后的叙事段落（80字内）",
      "date_range": "2025-06 ~ 2025-07"
    }
  ],
  "arcs": [
    {
      "title": "弧线主题名（10字内）",
      "summary": "一句话描述（30字内）"
    }
  ]
}`;

  const raw = await _callAI(prompt, 800);
  const result = parseJSON(raw);
  if (!result) return;

  const updatedFragments = [...activeFragments];

  // 任务一：更新星座字段
  if (Array.isArray(result.constellations)) {
    for (const constellation of result.constellations) {
      if (!constellation.name || !Array.isArray(constellation.fragment_indices))
        continue;
      for (const idx of constellation.fragment_indices) {
        if (updatedFragments[idx]) {
          updatedFragments[idx] = {
            ...updatedFragments[idx],
            constellation: constellation.name,
            constellation_summary: constellation.summary || "",
            updated_at: new Date().toISOString(),
          };
        }
      }
    }
    console.log(`[LocalMemory] 星座聚类: ${result.constellations.length} 个`);
  }

  // 任务二：存叙事，给参与合并的碎片打标记
  if (Array.isArray(result.narratives) && result.narratives.length > 0) {
    const existingNarratives = JSON.parse(
      localStorage.getItem(`narratives_${personaId}`) || "[]",
    );
    for (const narrative of result.narratives) {
      if (!narrative.content || !narrative.constellation) continue;
      const narrativeId = Date.now() + Math.random();
      // 检查同一星座是否已有叙事，有则更新
      const existIdx = existingNarratives.findIndex(
        (n) => n.constellation === narrative.constellation,
      );
      const narrativeEntry = {
        id: narrativeId,
        constellation: narrative.constellation,
        content: narrative.content,
        date_range: narrative.date_range || "",
        fragment_count: (narrative.fragment_indices || []).length,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (existIdx > -1) {
        existingNarratives[existIdx] = {
          ...existingNarratives[existIdx],
          ...narrativeEntry,
        };
      } else {
        existingNarratives.push(narrativeEntry);
      }
      // 给参与合并的碎片打上 narrative_id
      for (const idx of narrative.fragment_indices || []) {
        if (updatedFragments[idx]) {
          updatedFragments[idx] = {
            ...updatedFragments[idx],
            narrative_id: narrativeEntry.id,
            updated_at: new Date().toISOString(),
          };
        }
      }
    }
    localStorage.setItem(
      `narratives_${personaId}`,
      JSON.stringify(existingNarratives.slice(0, 50)),
    );
    console.log(`[LocalMemory] 叙事合并: ${result.narratives.length} 条`);
  }

  // 合并回 frozen/expired
  const frozenExpired = fragments.filter(
    (f) => f.status === "frozen" || f.status === "expired",
  );
  await storage.saveFragments(personaId, [
    ...updatedFragments,
    ...frozenExpired,
  ]);

  // 任务三：更新弧线
  if (Array.isArray(result.arcs) && result.arcs.length > 0) {
    const arcs = await storage.getArcs(personaId);
    for (const arc of result.arcs) {
      if (!arc.title) continue;
      const existingIdx = arcs.findIndex(
        (a) =>
          a.title === arc.title ||
          arc.title.includes(a.title) ||
          a.title.includes(arc.title),
      );
      if (existingIdx > -1) {
        arcs[existingIdx].summary = arc.summary;
        arcs[existingIdx].updated_at = new Date().toISOString();
      } else {
        arcs.push({
          id: Date.now() + Math.random(),
          title: arc.title,
          summary: arc.summary,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }
    await storage.saveArcs(personaId, arcs);
    console.log(`[LocalMemory] 弧线更新: ${result.arcs.length} 条`);
  }
}

// ========== 主入口 ==========
export async function processLocalMemory(
  personaId,
  recentMessages,
  userMessage,
  aiReply,
  totalMessageCount,
  userName = "对方",
  personaName = "AI",
) {
  try {
    const cfg = getCfg();
    if (cfg.memoryEnabled === false) return;

    // 新增：参数校验
    if (!userMessage || typeof userMessage !== "string") {
      console.warn("[LocalMemory] userMessage 无效，跳过批处理");
      return;
    }

    const quickExtractEvery = cfg.quickExtractEvery ?? 20;
    const forgetCurve = cfg.forgetCurve !== false;

    markMessageAdded(personaId);

    const isHighEmotion = checkEmotionTrigger(userMessage);
    const shouldBatch =
      isHighEmotion ||
      (quickExtractEvery > 0 && totalMessageCount % quickExtractEvery === 0);

    if (shouldBatch) {
      console.log(
        `[LocalMemory] 触发批处理 (第${totalMessageCount}条${isHighEmotion ? " 高情绪" : ""})`,
      );

      const result = await runBatch(
        personaId,
        recentMessages,
        userMessage,
        aiReply,
        userName,
        personaName,
      );
      await dispatchBatchResult(personaId, result);
    }

    const heavyEvery = cfg.compressThreshold || 50;
    if (totalMessageCount > 0 && totalMessageCount % heavyEvery === 0) {
      if (forgetCurve) await decayFragments(personaId);
      await updateConstellationsAndArcs(personaId);
    }
  } catch (e) {
    console.error("[LocalMemory] 处理管道错误:", e);
  }
}

// ========== 手动触发 ==========
export async function manualSediment(personaId) {
  const msgs = await storage.getMessages(personaId);
  const recent = msgs.slice(-20);
  if (recent.length === 0) return { success: false };

  const userMsg =
    recent.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
  const aiMsg =
    recent.filter((m) => m.role === "ai").slice(-1)[0]?.content || "";

  const persona = await storage.getPersona(personaId);
  const userName = persona?.call_user || "你";
  const personaName = persona?.note || persona?.name || "AI";

  const result = await runBatch(
    personaId,
    recent,
    userMsg,
    aiMsg,
    userName,
    personaName,
  );

  if (!result) return { success: false };

  await dispatchBatchResult(personaId, result);
  return { success: true };
}

// ========== 语料库对外接口 ==========
export function getLocalSamples(personaId) {
  return getSamples(personaId);
}

export function deleteLocalSample(personaId, id) {
  const samples = getSamples(personaId);
  localStorage.setItem(
    `samples_${personaId}`,
    JSON.stringify(samples.filter((s) => s.id !== id)),
  );
}

// ========== 星图节点对外接口 ==========
export function getLocalGraphNodes(personaId) {
  return getGraphNodes(personaId);
}
