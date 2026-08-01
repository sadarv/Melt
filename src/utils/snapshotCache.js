import { storage } from './storage'
import { isLocalMode } from './api'

const SNAPSHOT_PREFIX = 'melt_snapshot_'

export async function cacheSnapshot(personaId) {
  // 本地模式直接从 storage 构建，不碰云端
  if (isLocalMode) {
    const persona = storage.getPersona(personaId) || {}
    const memories = storage.getMemories(personaId) || []
    const snapshot = {
      persona: persona.content || '',
      personaFull: persona,
      memories: Array.isArray(memories) ? memories : [],
      worldbooks: [],
      updatedAt: Date.now(),
    }
    localStorage.setItem(SNAPSHOT_PREFIX + personaId, JSON.stringify(snapshot))
    return snapshot
  }

  // personal 模式走云端
  try {
    const { api } = await import('./api')
    const [personaRes, memoriesRes, worldbooksRes] = await Promise.all([
      api(`/api/persona/${personaId}`),
      api(`/api/memories/${personaId}`),
      api('/api/worldbooks'),
    ])
    const persona = personaRes.ok ? await personaRes.json() : {}
    const memories = memoriesRes.ok ? await memoriesRes.json() : []
    const worldbooks = worldbooksRes.ok ? await worldbooksRes.json() : []
    const snapshot = {
      persona: persona.content || persona.note || '',
      personaFull: persona,
      memories: Array.isArray(memories) ? memories : memories.memories || [],
      worldbooks: Array.isArray(worldbooks) ? worldbooks : [],
      updatedAt: Date.now(),
    }
    localStorage.setItem(SNAPSHOT_PREFIX + personaId, JSON.stringify(snapshot))
    return snapshot
  } catch (e) {
    console.warn('[SnapshotCache] 更新快照失败', e)
  }
}

export function getSnapshot(personaId) {
  const raw = localStorage.getItem(SNAPSHOT_PREFIX + personaId)
  return raw ? JSON.parse(raw) : null
}

export function buildFallbackSystemPrompt(snapshot) {
  const { persona, memories, worldbooks } = snapshot
  let prompt = `${persona}\n\n`
  if (worldbooks.length > 0) {
    prompt += `[世界设定]\n`
    worldbooks.forEach(wb => {
      prompt += `- ${wb.keys?.join(', ') || wb.name}: ${wb.content}\n`
    })
    prompt += '\n'
  }
  if (memories.length > 0) {
    prompt += `[近期记忆]\n`
    memories.slice(-5).forEach(m => {
      prompt += `${m.role || '记忆'}: ${m.content}\n`
    })
    prompt += '\n'
  }
  prompt += `[指令] 请基于以上设定与记忆，用角色身份回复用户。`
  return prompt
}
