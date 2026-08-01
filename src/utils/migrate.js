import { api } from "@/utils/api";
import { put, STORES } from "@/utils/mediaDb";
import { storage } from "@/utils/storage";

async function _migratePersona(personaId) {
  console.log(`[Migration] 开始处理 Persona: ${personaId}`);
  try {
    const response = await api(
      `/api/export-for-migration?personaId=${personaId}`,
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `获取 ${personaId} 的云端数据失败: ${response.status} - ${errorText}`,
      );
    }
    const cloudData = await response.json();
    console.log(`[Migration] ${personaId} 的云端数据获取成功。`);

    if (cloudData.messages && cloudData.messages.length > 0) {
      const existing = await storage.getMessages(personaId);
      if (existing.length === 0) {
        await storage.saveMessages(
          personaId,
          cloudData.messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            msg_type: m.msg_type || "text",
          })),
        );
      }
    }

    let imageCount = 0;
    if (cloudData.messages && cloudData.messages.length > 0) {
      for (const message of cloudData.messages) {
        if (message.msg_type === "images" && message.msg_meta?.images) {
          await put(STORES.message_images, {
            id: String(message.id),
            images: message.msg_meta.images,
          });
          imageCount++;
        }
      }
    }

    let memoryCount = 0;
    if (cloudData.memories && cloudData.memories.length > 0) {
      for (const memory of cloudData.memories) {
        await put(STORES.local_fragments, {
          content: memory.content,
          heat: 100,
        });
        await storage.saveMemory(personaId, { content: memory.content });
        memoryCount++;
      }
    }

    let timelineCount = 0;
    if (cloudData.timelines && cloudData.timelines.length > 0) {
      for (const timeline of cloudData.timelines) {
        await put(STORES.local_timeline, {
          content: timeline.content,
          date: new Date(timeline.created_at).toISOString().split("T")[0],
        });
        await storage.addTimelineEvent(personaId, timeline.content);
        timelineCount++;
      }
    }

    console.log(
      `[Migration] ${personaId} 处理完成: ${imageCount}图片, ${memoryCount}记忆, ${timelineCount}时间线。`,
    );
    return { personaId, success: true, imageCount, memoryCount, timelineCount };
  } catch (error) {
    console.error(`[Migration] ${personaId} 迁移失败:`, error);
    return { personaId, success: false, error: error.message };
  }
}

export async function startSingleMigration(personaId) {
  if (!confirm(`确定要为 "${personaId}" 从云端导入所有历史数据到本地吗？`))
    return;

  const result = await _migratePersona(personaId);

  if (result.success) {
    alert(
      `"${personaId}" 数据迁移成功！\n- 迁移了 ${result.imageCount} 张图片\n- 迁移了 ${result.memoryCount} 条记忆\n- 迁移了 ${result.timelineCount} 条时间线事件\n\n请刷新应用。`,
    );
  } else {
    alert(
      `"${personaId}" 数据迁移失败！\n错误: ${result.error}\n详情请查看控制台。`,
    );
  }
}

export async function startFullMigration() {
  if (
    !confirm(
      `确定要迁移【所有】人格的云端数据到本地吗？\n这个过程可能非常耗时，请务必保持页面开启，不要关闭！`,
    )
  )
    return;

  console.log(`[Migration] 开始全量迁移...`);

  try {
    const personaListResponse = await api("/api/personas/all");
    if (!personaListResponse.ok) throw new Error("获取所有人格列表失败!");

    const allPersonas = await personaListResponse.json();
    if (!allPersonas || allPersonas.length === 0) {
      alert("未能获取到人格列表，无法开始全量迁移。");
      return;
    }

    const builtinIds = [
      "xiaorou",
      "cool",
      "guide",
      "agent",
      "pawzo_direct",
      "wechat_sync",
    ];
    const customPersonas = allPersonas.filter(
      (p) => !builtinIds.includes(p.id),
    );

    if (customPersonas.length > 0) {
      // 现在是异步，必须 await
      const existingLocal = await storage.getPersonas();
      const existingIds = new Set(existingLocal.map((p) => p.id));
      const toAdd = customPersonas
        .filter((p) => !existingIds.has(p.id))
        .map((p) => ({
          id: p.id,
          name: p.name || "",
          note: p.note || p.name || "",
          avatar: p.avatar || "💬",
          avatarUrl: p.avatar_url || p.avatarUrl || "",
          content: p.content || p.description || "",
          gender: p.gender || "",
          custom: true,
          created_at: p.created_at || new Date().toISOString(),
        }));

      if (toAdd.length > 0) {
        await storage.savePersonas([...existingLocal, ...toAdd]);
        console.log(`[Migration] 已写入 ${toAdd.length} 个自定义角色到本地`);
      }
    }

    const personaIds = allPersonas.map((p) => p.id);
    console.log(`[Migration] 将要迁移以下人格: ${personaIds.join(", ")}`);

    const summary = [];
    for (const personaId of personaIds) {
      const result = await _migratePersona(personaId);
      summary.push(result);
    }

    const successCount = summary.filter((r) => r.success).length;
    const failureCount = summary.filter((r) => !r.success).length;

    let report = `全量迁移完成！\n\n成功: ${successCount} 个\n失败: ${failureCount} 个\n\n`;
    summary.forEach((r) => {
      if (r.success) {
        report += `✓ ${r.personaId}: 成功 (图:${r.imageCount}, 忆:${r.memoryCount}, 线:${r.timelineCount})\n`;
      } else {
        report += `✗ ${r.personaId}: 失败 (${r.error.slice(0, 50)}...)\n`;
      }
    });

    if (failureCount > 0)
      report += "\n部分迁移失败，请检查控制台获取详细错误信息。";

    alert(report);
    console.log(report);
  } catch (error) {
    console.error("[Migration] 全量迁移过程中发生严重错误:", error);
    alert(`全量迁移失败！\n错误: ${error.message}\n详情请查看控制台。`);
  }
}
