import { defineStore } from "pinia";
import { ref } from "vue";
import { api, isLocalMode } from "@/utils/api";
import { getCache, setCache } from "@/utils/cache";
import { put as dbPut, get as dbGet, STORES } from "@/utils/mediaDb";
import { isCloudDown } from "@/utils/api";
import { emergencyMode, isEffectivelyOffline } from "@/utils/emergencyMode";
import { generateEmergencyReply } from "@/utils/localApi";
import { processLocalMemory } from "@/utils/localMemory";
import { storage } from "@/utils/storage";

function parseSpecialContent(content) {
  if (!content) return {};
  if (content.startsWith("[转账:") || content.startsWith("[转账: ")) {
    const match = content.match(/\[转账[: ]+¥?([\d.]+)\]/);
    if (match) return { type: "transfer", amount: parseFloat(match[1]), note: "" };
  }
  if (content.startsWith("[礼物:") || content.startsWith("[礼物: ")) {
    const match = content.match(/\[礼物[: ]+(.+?)\]/);
    if (match) return { type: "gift", giftName: match[1], giftContent: "", giftMessage: "" };
  }
  if (content.startsWith("[位置") || content.startsWith("[位置:")) {
    const match = content.match(/\[位置[: ]*(.+?)\]/);
    return { type: "location", locationName: match ? match[1] : "位置" };
  }
  if (content.startsWith("[表情包:") || content.startsWith("[表情包: ")) {
    const match = content.match(/\[表情包[: ]+(.+?)\]/);
    if (match) return { type: "emoji", emojiName: match[1] };
  }
  return {};
}

function parseFromMeta(msgType, msgMeta) {
  if (!msgType || msgType === "text") return {};
  let meta = {};
  try {
    meta = msgMeta ? (typeof msgMeta === "string" ? JSON.parse(msgMeta) : msgMeta) : {};
  } catch {}
  if (msgType === "gift") return { type: "gift", giftName: meta.name || meta.giftName || "礼物", giftContent: meta.content || meta.giftContent || "", giftMessage: meta.message || meta.giftMessage || "" };
  if (msgType === "transfer") return { type: "transfer", amount: meta.amount || 0, note: meta.note || "" };
  if (msgType === "location") return { type: "location", locationName: meta.name || meta.locationName || "位置", lat: meta.lat || null, lng: meta.lng || null };
  if (msgType === "emoji") return { type: "emoji", emojiUrl: meta.url || "", emojiName: meta.name || "" };
  if (msgType === "food") return { type: "food", deliveryContent: meta.content || "", deliveryAddress: meta.address || "", deliveryNote: meta.note || "", deliveryExpectedAt: meta.expectedAt || null };
  if (msgType === "express") return { type: "express", deliveryContent: meta.content || "", deliveryNote: meta.note || "", deliveryExpectedAt: meta.expectedAt || null };
  return {};
}

export const useChatStore = defineStore("chat", () => {
  const messages = ref([]);
  const allMessages = ref([]);
  const hasMore = ref(false);
  const pageSize = 10;
  let currentLoadedPersona = null;
  let isLoading = false;
  let isLoadingHistory = false; // 加载历史期间跳过去重
  const totalMessageCount = ref(0);

  async function addMessage(msg, personaId = null) {
    const messageId = msg.id || `temp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const newMsg = {
      id: messageId,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp || new Date().toISOString(),
    };

    if (msg.images && msg.images.length > 0) {
      newMsg.type = "images";
      newMsg.images = msg.images;
      await dbPut(STORES.message_images, { id: String(messageId), images: msg.images }).catch((e) => console.error("Save image failed", e));
    } else if (msg.type === "images" || msg.content?.includes("[图片]")) {
      newMsg.type = "images";
      const cachedData = await dbGet(STORES.message_images, String(messageId)).catch(() => null);
      if (cachedData?.images) newMsg.images = cachedData.images;
    }

    const fields = ["type","giftName","giftContent","giftMessage","amount","note","locationName","lat","lng","emojiUrl","emojiName","cardHtml","deliveryContent","deliveryAddress","deliveryNote","deliveryExpectedAt","quoteContent","quoteRole","source","deliveryFromAddress","deliveryAmount"];
    fields.forEach((f) => { if (msg[f] !== undefined) newMsg[f] = msg[f]; });

    // 加载历史期间不做去重，由数据库保证唯一
    if (!isLoadingHistory) {
      // id 去重
      if (msg.id && !String(msg.id).startsWith("temp_")) {
        const existingById = allMessages.value.find(m => m.id && String(m.id) === String(msg.id));
        if (existingById) {
          console.log("[Chat] 拦截重复消息(by id):", String(msg.id).slice(0, 20));
          return;
        }
      }
      // 内容+时间去重（仅针对实时消息）
      const recent = messages.value.slice(-3);
      const isDuplicate = recent.some(
        (m) =>
          m.role === newMsg.role &&
          m.content === newMsg.content &&
          Math.abs(new Date(m.timestamp) - new Date(newMsg.timestamp)) < 3000,
      );
      if (isDuplicate) {
        console.log("[Chat] 拦截重复消息(by content):", newMsg.content.slice(0, 30));
        return;
      }
    }

    messages.value.push(newMsg);
    allMessages.value.push(newMsg);

    if (msg.role === "user") totalMessageCount.value++;

    // 只在明确传入 personaId 时才持久化（历史加载时传 null 跳过）
    if (isLocalMode && personaId) {
      await storage.appendMessage(personaId, {
        id: messageId,
        role: newMsg.role,
        content: newMsg.content,
        timestamp: newMsg.timestamp,
        msg_type: newMsg.type || "text",
      });
    }
  }

  function triggerMemoryProcessing(personaId, userMessage, aiReply) {
    const recentMessages = allMessages.value.slice(-15);
    setTimeout(() => {
      processLocalMemory(personaId, recentMessages, userMessage, aiReply, totalMessageCount.value)
        .catch((e) => console.error("[Chat] 记忆处理失败:", e));
    }, 0);
  }

  async function loadPersonaMessages(personaId) {
    if (!personaId) return;
    if (isLoading) return;
    isLoading = true;

    if (allMessages.value.length > 0 && currentLoadedPersona === personaId) {
      isLoading = false;
      return;
    }

    isLoadingHistory = true; // 开始加载历史，跳过去重
    try {
      let data = [];
      if (isLocalMode) {
        data = await storage.getMessages(personaId);
      } else {
        const res = await api(`/api/messages/${personaId}`);
        data = await res.json();
      }

      if (!Array.isArray(data)) data = [];

      messages.value = [];
      allMessages.value = [];

      for (const m of data) {
        if (m.role === "ai") {
          const bubbles = m.content.split("|||").map((s) => s.replace(/\n/g, " ").trim()).filter(Boolean);
          if (bubbles.length > 0) {
            for (let partIdx = 0; partIdx < bubbles.length; partIdx++) {
              const line = bubbles[partIdx];
              const special = partIdx === 0
                ? m.msg_type && m.msg_type !== "text"
                  ? parseFromMeta(m.msg_type, m.msg_meta)
                  : parseSpecialContent(line)
                : {};
              await addMessage({
                id: partIdx === 0 ? m.id : `${m.id}_${partIdx}`,
                role: m.role,
                content: line,
                timestamp: m.timestamp,
                ...special,
              });
            }
          } else {
            const special = m.msg_type && m.msg_type !== "text" ? parseFromMeta(m.msg_type, m.msg_meta) : {};
            await addMessage({
              id: m.id,
              role: m.role,
              content: m.content.replace(/\|\|\|/g, "").replace(/\n/g, " "),
              timestamp: m.timestamp,
              ...special,
            });
          }
        } else {
          const special = m.msg_type && m.msg_type !== "text"
            ? parseFromMeta(m.msg_type, m.msg_meta)
            : parseSpecialContent(m.content);
          await addMessage({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            ...special,
          });
        }
      }

      currentLoadedPersona = personaId;
      totalMessageCount.value = allMessages.value.filter((m) => m.role === "user").length;

      if (allMessages.value.length > pageSize) {
        messages.value = allMessages.value.slice(-pageSize);
        hasMore.value = true;
      } else {
        messages.value = allMessages.value;
        hasMore.value = false;
      }
    } catch (e) {
      console.error("加载消息失败:", e);
    }

    isLoadingHistory = false; // 加载完成，恢复去重
    isLoading = false;
  }

  function loadMore() {
    if (!hasMore.value) return;
    const currentCount = messages.value.length;
    const totalCount = allMessages.value.length;
    const startIdx = Math.max(0, totalCount - currentCount - pageSize);
    const endIdx = totalCount - currentCount;
    const older = allMessages.value.slice(startIdx, endIdx);
    messages.value = [...older, ...messages.value];
    hasMore.value = startIdx > 0;
  }

  function clearMessages() {
    messages.value = [];
    allMessages.value = [];
    hasMore.value = false;
    currentLoadedPersona = null;
    isLoading = false;
    isLoadingHistory = false;
    totalMessageCount.value = 0;
  }

  async function sendUserMessage(personaId, userContent) {
    const userMsg = { role: "user", content: userContent, timestamp: new Date().toISOString() };
    await addMessage(userMsg, personaId);

    if (emergencyMode.value) {
      const history = allMessages.value.map((m) => ({ role: m.role, content: m.content }));
      const reply = await generateEmergencyReply(personaId, userContent, history);
      const aiMsg = { role: "ai", content: reply, timestamp: new Date().toISOString() };
      await addMessage(aiMsg, personaId);
      if (isLocalMode) triggerMemoryProcessing(personaId, userContent, reply);
      return;
    }

    try {
      const res = await api(`/api/messages/${personaId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: userContent }),
      });
      if (!res.ok) throw new Error("Send failed");
      const data = await res.json();
      if (data.reply) {
        const aiMsg = { role: "ai", content: data.reply, timestamp: new Date().toISOString() };
        await addMessage(aiMsg, null);
        if (isLocalMode) triggerMemoryProcessing(personaId, userContent, data.reply);
      }
      import("@/utils/snapshotCache").then((m) => m.cacheSnapshot(personaId));
    } catch (e) {
      if (isEffectivelyOffline()) {
        console.log("[Chat] 消息已加入待发送队列");
      }
    }
  }

  return {
    messages,
    allMessages,
    hasMore,
    addMessage,
    loadPersonaMessages,
    loadMore,
    clearMessages,
    sendUserMessage,
    totalMessageCount,
    triggerMemoryProcessing,
  };
});