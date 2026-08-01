<template>
    <div class="diary-page">
        <div class="settings-blob sb-tl"></div>
        <div class="settings-blob sb-br"></div>

        <div class="diary-nav">
            <button class="diary-back" @click="goBack">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
            </button>
            <div class="diary-header-title">
                <span class="diary-title">手记</span>
                <span class="diary-subtitle">Journal</span>
            </div>
            <button class="diary-add-btn" @click="currentTab === 'user' ? showWrite = true : showAiWrite = true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M12 5v14M5 12h14" />
                </svg>
            </button>
        </div>

        <!-- tab 切换 -->
        <div class="diary-tabs">
            <button class="diary-tab" :class="{ active: currentTab === 'ai' }" @click="switchTab('ai')">
                {{ aiName }}的日记
            </button>
            <button class="diary-tab" :class="{ active: currentTab === 'user' }" @click="switchTab('user')">
                我的日记
            </button>
        </div>

        <div class="diary-content">
            <!-- AI tab 顶部操作 -->
            <div v-if="currentTab === 'ai'" class="ai-diary-toolbar">
                <div class="ai-toolbar-hint">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"
                        style="width:14px;height:14px;flex-shrink:0;">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 8v4M12 16h.01" />
                    </svg>
                    AI 会从当天对话中提炼感受写成日记
                </div>
                <div class="ai-toolbar-btns">
                    <label class="ai-toolbar-toggle">
                        <input type="checkbox" v-model="aiReadUserDiary" />
                        <span class="toggle-track">
                            <span class="toggle-thumb"></span>
                        </span>
                        <span class="toggle-label">读取我的日记</span>
                    </label>
                    <button class="ai-gen-btn" :disabled="generating" @click="generateAiDiary">
                        <svg v-if="!generating" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" style="width:13px;height:13px;">
                            <path d="M12 2L2 7l10 5 10-5-10-5z" />
                            <path d="M2 17l10 5 10-5" />
                            <path d="M2 12l10 5 10-5" />
                        </svg>
                        <span class="gen-spinner" v-else></span>
                        {{ generating ? '生成中...' : '立即生成' }}
                    </button>
                </div>
            </div>

            <div v-if="entries.length === 0 && !generating" class="empty-state-unified">
                <p class="empty-icon">📝</p>
                <p class="empty-title">还没有日记</p>
                <p class="empty-sub" v-if="currentTab === 'ai'">点击右上角 + 或「立即生成」让 {{ aiName }} 写一篇</p>
                <p class="empty-sub" v-else>点击右上角 + 写一篇</p>
            </div>

            <div v-if="generating" class="generating-placeholder">
                <div class="gen-dots">
                    <span></span><span></span><span></span>
                </div>
                <p>{{ aiName }} 正在回忆今天...</p>
            </div>

            <div v-for="entry in entries" :key="entry.id" class="diary-card">
                <div class="diary-card-header">
                    <span class="diary-date">{{ entry.date }}</span>
                    <button class="diary-edit-btn" @click="startEdit(entry)">✎</button>
                </div>
                <p class="diary-entry-title" v-if="entry.title">{{ entry.title }}</p>
                <p class="diary-entry-content">{{ entry.content }}</p>
            </div>
        </div>

        <!-- 用户写日记弹窗 -->
        <BlurModal :visible="showWrite" @close="showWrite = false">
            <h3>写日记</h3>
            <DreamInput label="标题" v-model="newDiary.title" placeholder="今天的标题..." />
            <DreamInput label="内容" type="textarea" v-model="newDiary.content" :rows="6" placeholder="写点什么..." />
            <div class="modal-actions">
                <SoftButton variant="secondary" @click="showWrite = false">取消</SoftButton>
                <SoftButton variant="primary" @click="writeDiary" :disabled="!newDiary.content.trim()">保存</SoftButton>
            </div>
        </BlurModal>

        <!-- AI 手动写日记弹窗 -->
        <BlurModal :visible="showAiWrite" @close="showAiWrite = false">
            <h3>让 {{ aiName }} 写日记</h3>
            <p class="modal-hint">{{ aiName }} 会根据今天的对话内容写一篇日记</p>
            <label class="modal-toggle-row">
                <input type="checkbox" v-model="aiReadUserDiary" />
                <span class="toggle-track">
                    <span class="toggle-thumb"></span>
                </span>
                <span class="modal-toggle-label">读取我今天的日记作为参考</span>
            </label>
            <div class="modal-hint-sub" v-if="aiReadUserDiary">
                {{ aiName }} 会先读你今天写的日记，再写自己的感受
            </div>
            <div class="modal-actions">
                <SoftButton variant="secondary" @click="showAiWrite = false">取消</SoftButton>
                <SoftButton variant="primary" @click="generateAiDiary">开始生成</SoftButton>
            </div>
        </BlurModal>

        <!-- 编辑弹窗 -->
        <BlurModal :visible="showEdit" @close="showEdit = false">
            <h3>编辑日记</h3>
            <DreamInput label="标题" v-model="editTitle" placeholder="标题..." />
            <DreamInput label="内容" type="textarea" v-model="editContent" :rows="6" />
            <div class="modal-actions">
                <SoftButton variant="danger" @click="deleteEntry">删除</SoftButton>
                <SoftButton variant="secondary" @click="showEdit = false">取消</SoftButton>
                <SoftButton variant="primary" @click="saveEdit">保存</SoftButton>
            </div>
        </BlurModal>
    </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { api } from '@/utils/api'
import SoftButton from '@/components/ui/SoftButton.vue'
import DreamInput from '@/components/ui/DreamInput.vue'
import BlurModal from '@/components/ui/BlurModal.vue'
import { useRoute, useRouter } from 'vue-router'

const currentTab = ref('ai')
const entries = ref([])
const aiName = ref('TA')
const currentPersonaId = ref('')
const generating = ref(false)
const aiReadUserDiary = ref(false)

const showWrite = ref(false)
const showAiWrite = ref(false)
const showEdit = ref(false)
const editEntryId = ref('')
const editTitle = ref('')
const editContent = ref('')
const editEntryType = ref('user')

const route = useRoute()
const router = useRouter()
const newDiary = reactive({ title: '', content: '' })

function getDiaryKey(type, personaId) {
    return type === 'ai' ? `diary_ai_${personaId}` : 'diary_user'
}

function loadLocalDiaries(type) {
    const key = getDiaryKey(type, currentPersonaId.value)
    try { return JSON.parse(localStorage.getItem(key) || '[]') } catch { return [] }
}

async function loadEntries() {
    try {
        const res = await api(`/api/diary/${currentTab.value}?persona=${currentPersonaId.value}`)
        const data = await res.json()
        entries.value = Array.isArray(data) ? data : []
    } catch {
        entries.value = []
    }
}

async function loadAiName() {
    try {
        const latestRes = await api('/api/messages/latest-persona')
        const latestData = await latestRes.json()
        currentPersonaId.value = latestData.personaId || 'xiaorou'
        const detailRes = await api(`/api/persona/${currentPersonaId.value}`)
        const detail = await detailRes.json()
        aiName.value = detail.note || detail.name || 'TA'
    } catch { }
}

function switchTab(tab) {
    currentTab.value = tab
    loadEntries()
}

async function writeDiary() {
    if (!newDiary.content.trim()) return
    const today = new Date().toISOString().slice(0, 10)
    const entry = {
        title: newDiary.title || `日记 · ${today}`,
        content: newDiary.content,
        date: today,
        type: 'user',
    }
    try {
        await api('/api/diary/write', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(entry)
        })
    } catch { }
    showWrite.value = false
    newDiary.title = ''
    newDiary.content = ''
    await loadEntries()
}

async function generateAiDiary() {
    if (generating.value) return
    generating.value = true
    showAiWrite.value = false

    try {
        const today = new Date().toISOString().slice(0, 10)
        let userDiaryRef = ''

        if (aiReadUserDiary.value) {
            const userDiaries = loadLocalDiaries('user')
            const todayUserDiary = userDiaries.find(d => d.date === today)
            if (todayUserDiary) userDiaryRef = todayUserDiary.content
        }

        const res = await api(`/api/diary/ai-generate/${currentPersonaId.value}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                date: today,
                readUserDiary: aiReadUserDiary.value,
                userDiaryContent: userDiaryRef,
            })
        })

        const data = await res.json()

        if (data.entry) {
            const entry = {
                title: data.entry.title || `${aiName.value}的日记 · ${today}`,
                content: data.entry.content,
                date: today,
                type: 'ai',
                personaId: currentPersonaId.value,
            }
            try {
                await api('/api/diary/write', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(entry)
                })
            } catch { }
        }

        await loadEntries()
        if (currentTab.value !== 'ai') switchTab('ai')
    } catch (e) {
        console.error('AI 日记生成失败:', e)
    } finally {
        generating.value = false
    }
}

function startEdit(entry) {
    editEntryId.value = entry.id
    editTitle.value = entry.title || ''
    editContent.value = entry.content
    editEntryType.value = entry.type || currentTab.value
    showEdit.value = true
}

async function saveEdit() {
    if (!editContent.value.trim()) return
    try {
        await api(`/api/diary/${editEntryId.value}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: editTitle.value, content: editContent.value })
        })
    } catch { }
    showEdit.value = false
    await loadEntries()
}

async function deleteEntry() {
    if (!confirm('确定删除这篇日记？')) return
    try {
        await api(`/api/diary/${editEntryId.value}`, { method: 'DELETE' })
    } catch { }
    showEdit.value = false
    await loadEntries()
}

function goBack() {
    const from = route.query.from
    if (from === 'habitat') {
        sessionStorage.setItem('home_return_page', '0')
        router.push('/')
    } else {
        router.push('/')
    }
}

onMounted(async () => {
    await loadAiName()
    await loadEntries()
})
</script>

<style scoped>
.diary-page {
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

.diary-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(env(safe-area-inset-top, 44px) + 8px) 16px 4px;
    flex-shrink: 0;
    position: relative;
    z-index: 2;
}

.diary-header-title {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 8px;
    justify-content: center;
}

.diary-back {
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

.diary-back svg {
    width: 16px;
    height: 16px;
    stroke: #D9A3AF;
}

.diary-title {
    font-size: 22px;
    font-weight: 800;
    color: #4A3F41;
    letter-spacing: 0.3px;
}

.diary-subtitle {
    font-size: 11px;
    color: #B8A9AC;
    font-weight: 400;
    letter-spacing: 1.5px;
}

.diary-add-btn {
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

.diary-add-btn svg {
    width: 18px;
    height: 18px;
    stroke: #D9A3AF;
}

.diary-tabs {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    flex-shrink: 0;
    position: relative;
    z-index: 1;
}

.diary-tab {
    padding: 8px 18px;
    border-radius: 20px;
    border: 1px solid rgba(255, 240, 242, 0.4);
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: saturate(180%) blur(16px);
    -webkit-backdrop-filter: saturate(180%) blur(16px);
    font-size: 12px;
    color: #B8A9AC;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
}

.diary-tab.active {
    background: linear-gradient(135deg, #E8C0C9, #D9A3AF);
    color: white;
    border-color: transparent;
}

.diary-content {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px;
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
    position: relative;
    z-index: 1;
}

.diary-content::-webkit-scrollbar {
    display: none;
}

.diary-card {
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.7);
    border-radius: 18px;
    padding: 16px;
    margin-bottom: 12px;
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
}

.diary-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}

.diary-date {
    font-size: 11px;
    color: #B8A9AC;
}

.diary-edit-btn {
    background: none;
    border: none;
    font-size: 14px;
    color: #D9A3AF;
    cursor: pointer;
    opacity: 0.5;
}

.diary-entry-title {
    font-size: 14px;
    font-weight: 600;
    color: #4A3F41;
    margin-bottom: 6px;
}

.diary-entry-content {
    font-size: 13px;
    color: #4A3F41;
    line-height: 1.7;
    white-space: pre-line;
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

/* AI toolbar */
.ai-diary-toolbar {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 4px;
    margin-bottom: 4px;
}

.ai-toolbar-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #B8A9AC;
}

.ai-toolbar-btns {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
}

.ai-toolbar-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
}

.toggle-track {
    position: relative;
    width: 36px;
    height: 20px;
    background: rgba(217, 163, 175, 0.2);
    border-radius: 10px;
    flex-shrink: 0;
    transition: background 0.25s;
}

.ai-toolbar-toggle input:checked~.toggle-track {
    background: linear-gradient(135deg, #E8C0C9, #D9A3AF);
}

.ai-toolbar-toggle input {
    display: none;
}

.toggle-thumb {
    position: absolute;
    width: 14px;
    height: 14px;
    background: white;
    border-radius: 50%;
    top: 3px;
    left: 3px;
    transition: transform 0.25s;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}

.ai-toolbar-toggle input:checked~.toggle-track .toggle-thumb {
    transform: translateX(16px);
}

.toggle-label {
    font-size: 12px;
    color: #6B5B5E;
}

.ai-gen-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 14px;
    border: none;
    background: linear-gradient(135deg, #E8C0C9, #D9A3AF);
    color: white;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    flex-shrink: 0;
}

.ai-gen-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.gen-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

/* 生成中占位 */
.generating-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 40px 0;
    color: #B8A9AC;
    font-size: 13px;
}

.gen-dots {
    display: flex;
    gap: 6px;
}

.gen-dots span {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #D9A3AF;
    animation: dot-bounce 1.2s ease-in-out infinite;
}

.gen-dots span:nth-child(2) {
    animation-delay: 0.2s;
}

.gen-dots span:nth-child(3) {
    animation-delay: 0.4s;
}

@keyframes dot-bounce {

    0%,
    80%,
    100% {
        transform: scale(0.6);
        opacity: 0.4;
    }

    40% {
        transform: scale(1);
        opacity: 1;
    }
}

/* 弹窗内 toggle */
.modal-toggle-row {
    display: flex;
    align-items: center;
    gap: 10px;
    cursor: pointer;
    padding: 8px 0;
}

.modal-toggle-row input {
    display: none;
}

.modal-toggle-row input:checked~.toggle-track {
    background: linear-gradient(135deg, #E8C0C9, #D9A3AF);
}

.modal-toggle-label {
    font-size: 13px;
    color: #4A3F41;
}

.modal-hint {
    font-size: 12px;
    color: #B8A9AC;
    margin-bottom: 12px;
    line-height: 1.6;
}

.modal-hint-sub {
    font-size: 11px;
    color: #D9A3AF;
    background: rgba(217, 163, 175, 0.08);
    border-radius: 10px;
    padding: 8px 12px;
    margin-top: 8px;
    line-height: 1.5;
}
</style>
