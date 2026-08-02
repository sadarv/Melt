<template>
    <div class="memory-page">
        <div class="settings-blob sb-tl"></div>
        <div class="settings-blob sb-br"></div>

        <div class="memory-nav">
            <button class="memory-back" @click="goBack">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
            </button>
            <div class="memory-breadcrumb">
                <span class="breadcrumb-item" :class="{ active: currentView === 'main' }"
                    @click="currentView = 'main'">记忆库</span>
                <template v-if="currentView !== 'main'">
                    <span class="breadcrumb-sep">›</span>
                    <span class="breadcrumb-item" :class="{ active: currentView === 'year' }"
                        @click="currentView = 'year'">{{ selectedYear }}年</span>
                </template>
                <template v-if="currentView === 'month' || currentView === 'date'">
                    <span class="breadcrumb-sep">›</span>
                    <span class="breadcrumb-item" :class="{ active: currentView === 'month' }"
                        @click="currentView = 'month'">{{ parseInt(selectedMonth) }}月</span>
                </template>
                <template v-if="currentView === 'date'">
                    <span class="breadcrumb-sep">›</span>
                    <span class="breadcrumb-item active">{{ parseInt(selectedDate.slice(8)) }}日</span>
                </template>
            </div>
            <button v-if="currentView === 'main'" class="memory-add-btn" @click="showAddMemory = true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M12 5v14M5 12h14" />
                </svg>
            </button>
            <div v-else style="width:36px;"></div>
        </div>

        <div class="persona-scroll" v-if="currentView === 'main'">
            <div v-for="p in personas" :key="p.id" class="persona-chip" :class="{ active: currentPersona === p.id }"
                @click="switchPersona(p.id)">
                <div class="persona-chip-avatar">
                    <img v-if="p.avatarUrl" :src="p.avatarUrl" />
                    <span v-else>{{ p.avatar || '💬' }}</span>
                </div>
                <span>{{ p.note || p.name }}</span>
            </div>
        </div>

        <div class="memory-content">
            <template v-if="currentView === 'main'">
                <div class="section-label-sm">长期印象</div>
                <div class="settings-group">
                    <div class="settings-group-item col-item">
                        <p class="content-text" v-if="profile">{{ profile }}</p>
                        <p class="content-text empty" v-else>还没有形成长期印象，多聊一会儿吧</p>
                    </div>
                </div>

                <template v-if="arcs.length > 0">
                    <div class="section-label-sm">长期主题</div>
                    <div class="arc-list">
                        <div v-for="arc in arcs" :key="arc.id" class="arc-card">
                            <div class="arc-header">
                                <span class="arc-theme">{{ arc.title || arc.theme }}</span>
                                <span class="arc-date">{{ arc.updated_at?.slice(0, 10) }}</span>
                            </div>
                            <p class="arc-summary">{{ arc.summary }}</p>
                        </div>
                    </div>
                </template>

                <template v-if="narratives.length > 0">
                    <div class="section-label-sm"
                        style="display:flex;justify-content:space-between;align-items:center;">
                        <span>记忆叙事</span>
                        <span class="fragment-count">{{ narratives.length }} 段</span>
                    </div>
                    <div class="narrative-list">
                        <div v-for="n in narratives" :key="n.id" class="narrative-card"
                            :class="{ expanded: expandedNarrative === n.id }"
                            @click="expandedNarrative = expandedNarrative === n.id ? null : n.id">
                            <div class="narrative-header">
                                <div class="narrative-constellation">
                                    <span class="constellation-dot"></span>
                                    {{ n.constellation }}
                                </div>
                                <span class="narrative-range">{{ n.date_range }}</span>
                            </div>
                            <p class="narrative-content" :class="{ collapsed: expandedNarrative !== n.id }">
                                {{ n.content }}
                            </p>
                            <div class="narrative-footer">
                                <span class="narrative-fragments">{{ n.fragment_count }} 条碎片合并</span>
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                    stroke-linecap="round" class="narrative-expand-icon"
                                    :style="{ transform: expandedNarrative === n.id ? 'rotate(180deg)' : '' }">
                                    <path d="M6 9l6 6 6-6" />
                                </svg>
                            </div>
                        </div>
                    </div>
                </template>

                <template v-if="fragments.length > 0">
                    <div class="section-label-sm"
                        style="display:flex;justify-content:space-between;align-items:center;">
                        <span>记忆碎片</span>
                        <div style="display:flex;gap:8px;align-items:center;">
                            <span class="fragment-filter-btn" :class="{ active: fragmentFilter === 'all' }"
                                @click="fragmentFilter = 'all'">全部</span>
                            <span class="fragment-filter-btn" :class="{ active: fragmentFilter === 'active' }"
                                @click="fragmentFilter = 'active'">活跃</span>
                            <span class="fragment-count">{{ filteredFragments.length }} 条</span>
                        </div>
                    </div>
                    <div class="fragment-list">
                        <div v-for="frag in filteredFragments" :key="frag.id" class="fragment-item"
                            :class="'frag-' + (frag.status || 'active')">
                            <div class="fragment-heat" :style="{ opacity: Math.min(1, frag.heat / 150) }"></div>
                            <div class="fragment-body">
                                <span class="fragment-content">{{ frag.content }}</span>
                                <span v-if="frag.constellation" class="fragment-constellation-tag">
                                    {{ frag.constellation }}
                                </span>
                            </div>
                            <div class="fragment-meta">
                                <span class="fragment-date">{{ frag.source_date }}</span>
                                <span class="fragment-confidence"
                                    v-if="frag.confidence && frag.confidence < 0.7">模糊</span>
                                <span class="fragment-status-dot" :class="frag.status || 'active'"></span>
                            </div>
                        </div>
                    </div>
                </template>

                <div class="section-label-sm">最近 63 天</div>
                <div class="settings-group">
                    <div class="settings-group-item col-item" style="gap:10px;">
                        <div class="heatmap-wrap">
                            <div class="heatmap-weekdays">
                                <span>一</span><span>三</span><span>五</span><span>日</span>
                            </div>
                            <div class="heatmap-grid">
                                <div v-for="(day, idx) in heatmapDays" :key="idx" class="heat-cell"
                                    :class="{ 'has-data': day.count > 0, 'future': day.future, 'empty-day': !day.future && day.count === 0 }"
                                    :style="day.future ? {} : { '--intensity': day.count > 0 ? day.intensity : 0.08 }"
                                    :title="day.date ? day.date + ': ' + day.count + ' 条' : ''"
                                    @click="day.date && !day.future && day.count > 0 && openDate(day.date)">
                                </div>
                            </div>
                        </div>
                        <div class="heatmap-legend">
                            <span class="legend-label">少</span>
                            <div class="legend-cells">
                                <div class="legend-cell" style="--intensity:0.1"></div>
                                <div class="legend-cell" style="--intensity:0.3"></div>
                                <div class="legend-cell" style="--intensity:0.6"></div>
                                <div class="legend-cell" style="--intensity:1"></div>

                            </div>
                            <span class="legend-label">多</span>
                        </div>
                    </div>
                </div>

                <div class="section-label-sm">记忆归档</div>
                <div v-if="Object.keys(dateTree).length > 0" class="year-grid">
                    <div v-for="year in Object.keys(dateTree).sort().reverse()" :key="year" class="year-card"
                        @click="openYear(year)">
                        <span class="year-num">{{ year }}</span>
                        <span class="year-sub">年</span>
                        <span class="year-months">{{ Object.keys(dateTree[year]).length }} 个月</span>
                    </div>
                </div>
                <div v-else class="empty-state-unified">
                    <p class="empty-icon">🧠</p>
                    <p class="empty-title">还没有记忆归档</p>
                    <p class="empty-sub">聊得越多，记忆库越丰富</p>
                </div>
            </template>

            <template v-if="currentView === 'year'">
                <div class="section-label-sm">选择月份</div>
                <div class="month-grid">
                    <div v-for="month in Object.keys(dateTree[selectedYear] || {}).sort().reverse()" :key="month"
                        class="month-card" @click="openMonth(month)">
                        <span class="month-num">{{ parseInt(month) }}</span>
                        <span class="month-sub">月</span>
                    </div>
                </div>
            </template>

            <template v-if="currentView === 'month'">
                <div class="section-label-sm">选择日期</div>
                <div class="day-grid">
                    <div v-for="day in monthDays" :key="day" class="day-card"
                        @click="openDate(`${selectedYear}-${selectedMonth}-${day}`)">
                        <span class="day-num">{{ parseInt(day) }}</span>
                        <span class="day-sub">日</span>
                    </div>
                </div>
            </template>

            <template v-if="currentView === 'date'">
                <div v-if="dayMemories.length > 0">
                    <div v-for="mem in dayMemories" :key="mem.id" class="settings-group" style="margin-bottom:10px;">
                        <div class="settings-group-item col-item" style="gap:10px;">
                            <p class="content-text">{{ mem.content }}</p>
                            <div class="mem-actions">
                                <button class="mini-btn" @click="startEditMemory(mem)">✎ 编辑</button>
                                <button class="mini-btn danger" @click="deleteMemory(mem.id)">删除</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div v-else class="empty-state-unified">
                    <p class="empty-icon">🌙</p>
                    <p class="empty-title">这天没有记忆</p>
                    <p class="empty-sub">也许是平静的一天</p>
                </div>
            </template>
        </div>

        <BlurModal :visible="showAddMemory" @close="showAddMemory = false">
            <h3>添加记忆</h3>
            <DreamInput type="textarea" v-model="newMemoryContent" :rows="4" placeholder="写下你想让TA记住的事..." />
            <div class="modal-actions">
                <SoftButton variant="secondary" @click="showAddMemory = false">取消</SoftButton>
                <SoftButton variant="primary" @click="addMemory" :disabled="!newMemoryContent.trim()">保存</SoftButton>
            </div>
        </BlurModal>

        <BlurModal :visible="showEditMemory" @close="showEditMemory = false">
            <h3>编辑记忆</h3>
            <DreamInput type="textarea" v-model="editMemoryContent" :rows="4" />
            <div class="modal-actions">
                <SoftButton variant="secondary" @click="showEditMemory = false">取消</SoftButton>
                <SoftButton variant="primary" @click="saveEditMemory">保存</SoftButton>
            </div>
        </BlurModal>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated } from 'vue'
import { api } from '@/utils/api'
import SoftButton from '@/components/ui/SoftButton.vue'
import BlurModal from '@/components/ui/BlurModal.vue'
import DreamInput from '@/components/ui/DreamInput.vue'

const personas = ref([])
const currentPersona = ref('')
const profile = ref('')
const heatmapData = ref({})
const dateTree = ref({})
const dayMemories = ref([])
const fragments = ref([])
const arcs = ref([])
const narratives = ref([])
const expandedNarrative = ref(null)
const fragmentFilter = ref('active')

const currentView = ref('main')
const selectedYear = ref('')
const selectedMonth = ref('')
const selectedDate = ref('')

const showAddMemory = ref(false)
const showEditMemory = ref(false)
const newMemoryContent = ref('')
const editMemoryContent = ref('')
const editMemoryId = ref(null)

const filteredFragments = computed(() => {
    if (fragmentFilter.value === 'all') return fragments.value
    return fragments.value.filter(f => f.status === 'active' || !f.status)
})

const heatmapDays = computed(() => {
    const days = []
    const now = new Date()
    const startDay = new Date(now)
    startDay.setDate(startDay.getDate() - 62)
    const dayOfWeek = startDay.getDay()
    const offset = dayOfWeek === 0 ? 6 : dayOfWeek - 1
    startDay.setDate(startDay.getDate() - offset)
    for (let i = 0; i < 63; i++) {
        const d = new Date(startDay)
        d.setDate(startDay.getDate() + i)
        if (d > now) { days.push({ date: '', count: 0, intensity: 0, future: true }); continue }
        const dateStr = d.toISOString().slice(0, 10)
        const count = heatmapData.value[dateStr] || 0
        // 有消息的格子按数量显示深浅，没消息的格子用固定淡色
        const intensity = count === 0 ? 0.08 : Math.min(1, 0.25 + count * 0.08)
        days.push({ date: dateStr, count, intensity, future: false })
    }
    return days
})

const monthDays = computed(() => {
    if (!selectedYear.value || !selectedMonth.value) return []
    return dateTree.value[selectedYear.value]?.[selectedMonth.value] || []
})

async function loadAll() {
    await Promise.all([
        loadProfile(), loadHeatmap(), loadDateTree(),
        loadFragments(), loadArcs(), loadNarratives(),
    ])
}

async function loadProfile() {
    try {
        const res = await api(`/api/memories/${currentPersona.value}`)
        const data = await res.json()
        profile.value = data.profile || ''
    } catch { }
}

async function loadHeatmap() {
    try {
        const res = await api(`/api/memories/${currentPersona.value}/heatmap`)
        heatmapData.value = await res.json()
    } catch { }
}

async function loadDateTree() {
    try {
        const res = await api(`/api/memories/${currentPersona.value}/dates`)
        dateTree.value = await res.json()
    } catch { }
}

async function loadFragments() {
    try {
        const res = await api(`/api/memory-fragments/${currentPersona.value}`)
        fragments.value = await res.json()
    } catch { }
}

async function loadArcs() {
    try {
        const res = await api(`/api/memory-arcs/${currentPersona.value}`)
        arcs.value = await res.json()
    } catch { }
}

async function loadNarratives() {
    try {
        const res = await api(`/api/memory-narratives/${currentPersona.value}`)
        narratives.value = await res.json()
    } catch { narratives.value = [] }
}

async function loadPersonas() {
    try {
        const res = await api('/api/personas/all')
        const data = await res.json()
        const hidden = JSON.parse(localStorage.getItem('hidden_personas') || '[]')
        personas.value = data.filter(p => !hidden.includes(p.id))
        const pinnedList = JSON.parse(localStorage.getItem('pinned_personas') || '[]')
        personas.value.sort((a, b) => {
            if (pinnedList.includes(a.id) && !pinnedList.includes(b.id)) return -1
            if (!pinnedList.includes(a.id) && pinnedList.includes(b.id)) return 1
            return 0
        })
        try {
            const latestRes = await api('/api/messages/latest-persona')
            const latestData = await latestRes.json()
            currentPersona.value = latestData.personaId || personas.value[0]?.id || 'xiaorou'
        } catch {
            currentPersona.value = personas.value[0]?.id || 'xiaorou'
        }
        await loadAll()
    } catch (e) { console.error('加载失败:', e) }
}

function switchPersona(id) {
    currentPersona.value = id
    currentView.value = 'main'
    loadAll()
}

function openYear(year) { selectedYear.value = year; currentView.value = 'year' }
function openMonth(month) { selectedMonth.value = month; currentView.value = 'month' }

async function openDate(date) {
    selectedDate.value = date
    const [year, month] = date.split('-')
    selectedYear.value = year
    selectedMonth.value = month
    currentView.value = 'date'
    try {
        const res = await api(`/api/memories/${currentPersona.value}/date/${date}`)
        dayMemories.value = await res.json()
    } catch { dayMemories.value = [] }
}

function goBack() {
    if (currentView.value === 'date') currentView.value = 'month'
    else if (currentView.value === 'month') currentView.value = 'year'
    else if (currentView.value === 'year') currentView.value = 'main'
    else window.history.length > 1 ? history.back() : location.href = '/'
}

async function addMemory() {
    if (!newMemoryContent.value.trim()) return
    try {
        const today = new Date().toISOString().slice(0, 10)
        await api(`/api/memories/${currentPersona.value}/custom`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: newMemoryContent.value.trim(), date: today })
        })
        newMemoryContent.value = ''
        showAddMemory.value = false
        await loadAll()
    } catch { }
}

function startEditMemory(mem) {
    editMemoryId.value = mem.id
    editMemoryContent.value = mem.content
    showEditMemory.value = true
}

async function deleteMemory(id) {
    if (!confirm('删除这条记忆？')) return
    try {
        await api(`/api/memories/recent/${id}`, { method: 'DELETE' })
        await openDate(selectedDate.value)
    } catch { }
}

async function saveEditMemory() {
    if (!editMemoryContent.value.trim()) return
    try {
        await api(`/api/memories/recent/${editMemoryId.value}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: editMemoryContent.value.trim() })
        })
        showEditMemory.value = false
        await openDate(selectedDate.value)
    } catch { }
}

onMounted(loadPersonas)
onActivated(loadPersonas)
</script>

<style scoped>
.memory-page {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    position: relative;
    background: linear-gradient(180deg, #FFFBFA 0%, #FFF0F2 60%, #FFE9ED 100%);
    box-sizing: border-box;
}

.settings-blob {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    z-index: 0;
    filter: blur(60px);
}

.sb-tl {
    top: -40px;
    left: -50px;
    width: 220px;
    height: 220px;
    background: #F1DADD;
    opacity: 0.45;
}

.sb-br {
    bottom: 40px;
    right: -60px;
    width: 200px;
    height: 200px;
    background: #98CBEA;
    opacity: 0.2;
}

.memory-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(env(safe-area-inset-top, 44px) + 8px) 16px 4px;
    flex-shrink: 0;
    position: relative;
    z-index: 2;
}

.memory-back {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.65);
    backdrop-filter: saturate(180%) blur(12px);
    -webkit-backdrop-filter: saturate(180%) blur(12px);
    border: 1px solid rgba(255, 240, 242, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(217, 163, 175, 0.08);
}

.memory-back svg {
    width: 16px;
    height: 16px;
    stroke: #D9A3AF;
}

.memory-breadcrumb {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    justify-content: center;
}

.breadcrumb-item {
    font-size: 14px;
    color: #B8A9AC;
    cursor: pointer;
    transition: color 0.2s;
}

.breadcrumb-item.active {
    font-size: 17px;
    font-weight: 800;
    color: #4A3F41;
    cursor: default;
}

.breadcrumb-sep {
    font-size: 12px;
    color: #D4C8CA;
}

.memory-add-btn {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.65);
    backdrop-filter: saturate(180%) blur(12px);
    -webkit-backdrop-filter: saturate(180%) blur(12px);
    border: 1px solid rgba(255, 240, 242, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.memory-add-btn svg {
    width: 18px;
    height: 18px;
    stroke: #D9A3AF;
}

.persona-scroll {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    overflow-x: auto;
    flex-shrink: 0;
    position: relative;
    z-index: 1;
}

.persona-scroll::-webkit-scrollbar {
    display: none;
}

.persona-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px 6px 6px;
    border-radius: 20px;
    border: 1px solid rgba(255, 240, 242, 0.4);
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: saturate(180%) blur(16px);
    -webkit-backdrop-filter: saturate(180%) blur(16px);
    cursor: pointer;
    white-space: nowrap;
    font-size: 12px;
    color: #6B5B5E;
    transition: all 0.2s;
}

.persona-chip.active {
    background: linear-gradient(135deg, #E8C0C9, #D9A3AF);
    color: white;
    border-color: transparent;
}

.persona-chip-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: rgba(255, 233, 237, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    overflow: hidden;
    flex-shrink: 0;
}

.persona-chip-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.memory-content {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px;
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
    position: relative;
    z-index: 1;
}

.memory-content::-webkit-scrollbar {
    display: none;
}

.section-label-sm {
    font-size: 11px;
    font-weight: 700;
    color: #B8A9AC;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    padding: 0 4px 8px;
    margin-top: 20px;
    display: block;
}

.settings-group {
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-radius: 22px;
    overflow: hidden;
    margin-bottom: 10px;
    box-shadow: 0 8px 24px rgba(217, 163, 175, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.5) inset;
    border: 1px solid rgba(255, 240, 242, 0.4);
}

.settings-group-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(217, 163, 175, 0.08);
}

.settings-group-item:last-child {
    border-bottom: none;
}

.col-item {
    flex-direction: column;
    align-items: flex-start;
}

.content-text {
    font-size: 13px;
    color: #4A3F41;
    line-height: 1.7;
    white-space: pre-line;
    width: 100%;
}

.content-text.empty {
    color: #B8A9AC;
    font-style: italic;
}

.arc-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 10px;
}

.arc-card {
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: saturate(180%) blur(16px);
    -webkit-backdrop-filter: saturate(180%) blur(16px);
    border-radius: 16px;
    padding: 14px 16px;
    border: 1px solid rgba(216, 205, 234, 0.3);
    box-shadow: 0 4px 12px rgba(216, 205, 234, 0.1);
}

.arc-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
}

.arc-theme {
    font-size: 13px;
    font-weight: 600;
    color: #9B89B4;
}

.arc-date {
    font-size: 10px;
    color: #B8A9AC;
}

.arc-summary {
    font-size: 12px;
    color: #6B5B5E;
    line-height: 1.6;
}

.narrative-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 10px;
}

.narrative-card {
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: saturate(180%) blur(16px);
    -webkit-backdrop-filter: saturate(180%) blur(16px);
    border-radius: 18px;
    padding: 14px 16px;
    border: 1px solid rgba(232, 192, 201, 0.25);
    box-shadow: 0 4px 14px rgba(217, 163, 175, 0.08);
    cursor: pointer;
    transition: all 0.2s;
}

.narrative-card:active {
    transform: scale(0.99);
}

.narrative-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.narrative-constellation {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: #D9A3AF;
}

.constellation-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: linear-gradient(135deg, #E8C0C9, #D9A3AF);
    flex-shrink: 0;
}

.narrative-range {
    font-size: 10px;
    color: #B8A9AC;
}

.narrative-content {
    font-size: 13px;
    color: #4A3F41;
    line-height: 1.75;
    transition: all 0.3s ease;
}

.narrative-content.collapsed {
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.narrative-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 10px;
}

.narrative-fragments {
    font-size: 10px;
    color: #B8A9AC;
}

.narrative-expand-icon {
    width: 14px;
    height: 14px;
    stroke: #D4C8CA;
    transition: transform 0.25s ease;
}

.fragment-count {
    font-size: 11px;
    color: #D9A3AF;
    font-weight: 600;
}

.fragment-filter-btn {
    font-size: 10px;
    color: #B8A9AC;
    cursor: pointer;
    padding: 2px 8px;
    border-radius: 8px;
    border: 1px solid transparent;
    transition: all 0.2s;
}

.fragment-filter-btn.active {
    color: #D9A3AF;
    border-color: rgba(217, 163, 175, 0.3);
    background: rgba(217, 163, 175, 0.08);
}

.fragment-list {
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: saturate(180%) blur(16px);
    -webkit-backdrop-filter: saturate(180%) blur(16px);
    border-radius: 18px;
    overflow: hidden;
    margin-bottom: 10px;
    border: 1px solid rgba(255, 240, 242, 0.4);
}

.fragment-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 11px 16px;
    border-bottom: 1px solid rgba(217, 163, 175, 0.08);
    transition: opacity 0.2s;
}

.fragment-item:last-child {
    border-bottom: none;
}

.fragment-item.frag-cooling {
    opacity: 0.7;
}

.fragment-item.frag-frozen {
    opacity: 0.45;
}

.fragment-heat {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #D9A3AF;
    flex-shrink: 0;
}

.fragment-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
}

.fragment-content {
    font-size: 13px;
    color: #4A3F41;
    line-height: 1.5;
}

.fragment-constellation-tag {
    font-size: 10px;
    color: #D9A3AF;
    background: rgba(217, 163, 175, 0.1);
    border-radius: 6px;
    padding: 1px 6px;
    align-self: flex-start;
}

.fragment-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 3px;
    flex-shrink: 0;
}

.fragment-date {
    font-size: 10px;
    color: #B8A9AC;
}

.fragment-confidence {
    font-size: 9px;
    color: #D4B896;
}

.fragment-status-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
}

.fragment-status-dot.active {
    background: #6BAF7A;
}

.fragment-status-dot.cooling {
    background: #98CBEA;
}

.fragment-status-dot.frozen {
    background: #D4C8CA;
}

/* 热力图 - 核心改动：用 rgba 而不是 opacity，让空格子也可见 */
.heatmap-wrap {
    display: flex;
    gap: 6px;
    width: 100%;
}

.heatmap-weekdays {
    display: flex;
    flex-direction: column;
    justify-content: space-around;
    padding-top: 2px;
    padding-bottom: 2px;
}

.heatmap-weekdays span {
    font-size: 9px;
    color: #B8A9AC;
    height: 14px;
    line-height: 14px;
}

.heatmap-grid {
    display: grid;
    grid-template-columns: repeat(9, 1fr);
    gap: 3px;
    flex: 1;
}

.heat-cell {
    aspect-ratio: 1;
    border-radius: 3px;
    background: #D9A3AF;
    opacity: var(--intensity, 0.08);
    cursor: pointer;
    transition: transform 0.15s;
}

.heat-cell.future {
    background: transparent;
    opacity: 0;
    cursor: default;
    pointer-events: none;
}

.heat-cell:not(.future):active {
    transform: scale(1.4);
}

.heatmap-legend {
    display: flex;
    align-items: center;
    gap: 4px;
    justify-content: flex-end;
    margin-top: 4px;
}

.legend-label {
    font-size: 10px;
    color: #B8A9AC;
}

.legend-cells {
    display: flex;
    gap: 3px;
}

.legend-cell {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background: #D9A3AF;
    opacity: var(--intensity);
}

.year-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 10px;
}

.year-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px 8px;
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: saturate(180%) blur(16px);
    -webkit-backdrop-filter: saturate(180%) blur(16px);
    border-radius: 18px;
    border: 1px solid rgba(255, 240, 242, 0.4);
    cursor: pointer;
    transition: all 0.2s;
    box-shadow: 0 4px 12px rgba(217, 163, 175, 0.08);
}

.year-card:active {
    transform: scale(0.96);
}

.year-num {
    font-size: 24px;
    font-weight: 800;
    color: #4A3F41;
}

.year-sub {
    font-size: 11px;
    color: #B8A9AC;
}

.year-months {
    font-size: 10px;
    color: #D9A3AF;
    margin-top: 4px;
}

.month-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    margin-bottom: 10px;
}

.month-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 14px 8px;
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: saturate(180%) blur(16px);
    -webkit-backdrop-filter: saturate(180%) blur(16px);
    border-radius: 16px;
    border: 1px solid rgba(255, 240, 242, 0.4);
    cursor: pointer;
    transition: all 0.2s;
}

.month-card:active {
    transform: scale(0.96);
}

.month-num {
    font-size: 20px;
    font-weight: 700;
    color: #4A3F41;
}

.month-sub {
    font-size: 11px;
    color: #B8A9AC;
}

.day-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    margin-bottom: 10px;
}

.day-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 12px 8px;
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: saturate(180%) blur(16px);
    -webkit-backdrop-filter: saturate(180%) blur(16px);
    border-radius: 14px;
    border: 1px solid rgba(255, 240, 242, 0.4);
    cursor: pointer;
    transition: all 0.2s;
}

.day-card:active {
    transform: scale(0.96);
}

.day-num {
    font-size: 18px;
    font-weight: 700;
    color: #4A3F41;
}

.day-sub {
    font-size: 10px;
    color: #B8A9AC;
}

.mem-actions {
    display: flex;
    gap: 8px;
    align-self: flex-end;
}

.mini-btn {
    background: none;
    border: 1px solid rgba(217, 163, 175, 0.3);
    border-radius: 8px;
    padding: 4px 10px;
    font-size: 11px;
    color: #D9A3AF;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.2s;
}

.mini-btn.danger {
    color: #c07070;
    border-color: rgba(192, 112, 112, 0.2);
}

.empty-state-unified {
    text-align: center;
    padding: 48px 24px;
}

.empty-icon {
    font-size: 28px;
    margin-bottom: 14px;
}

.empty-title {
    font-size: 14px;
    color: #4A3F41;
    font-weight: 400;
    margin-bottom: 6px;
}

.empty-sub {
    font-size: 12px;
    color: #B8A9AC;
    line-height: 1.6;
}

.modal-actions {
    display: flex;
    gap: 10px;
    margin-top: 16px;
}
</style>
