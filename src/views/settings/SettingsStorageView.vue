<template>
    <div class="sub-page">
        <div class="settings-blob sb-tl"></div>
        <div class="settings-blob sb-br"></div>

        <div class="settings-nav">
            <button class="settings-back" @click="$router.push('/settings')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
            </button>
            <span class="settings-title">存储空间</span>
            <div style="width:36px;"></div>
        </div>

        <div class="sub-content">

            <div class="section-label-sm" style="margin-top:12px;">存储使用情况</div>
            <div class="storage-card">
                <div class="storage-total">
                    <span class="storage-used">{{ totalUsed }}</span>
                    <span class="storage-unit">KB 已使用</span>
                </div>
                <div class="pie-wrap">
                    <svg viewBox="0 0 100 100" class="pie-svg">
                        <template v-for="(seg, idx) in pieSegments" :key="idx">
                            <circle cx="50" cy="50" r="38" fill="none" :stroke="seg.color" stroke-width="18"
                                :stroke-dasharray="`${seg.dash} ${seg.gap}`" :stroke-dashoffset="seg.offset"
                                style="transition: stroke-dasharray 0.6s ease;" />
                        </template>
                        <circle cx="50" cy="50" r="28" fill="rgba(255,251,250,0.9)" />
                        <g class="pie-text-group">
                            <text x="50" y="52" text-anchor="middle" font-size="10" fill="#4A3F41" font-weight="700"
                                dy="-0.3em">总计</text>
                            <text x="50" y="52" text-anchor="middle" font-size="8" fill="#B8A9AC" dy="0.8em">{{
                                totalUsed }}KB</text>
                        </g>
                    </svg>
                    <div class="pie-legend">
                        <div v-for="item in storageItems" :key="item.key" class="legend-item">
                            <div class="legend-dot" :style="{ background: item.color }"></div>
                            <span class="legend-label">{{ item.label }}</span>
                            <span class="legend-val">{{ item.size }}KB</span>
                        </div>
                    </div>
                </div>
                <div class="storage-bar">
                    <div v-for="item in storageItems" :key="item.key" class="storage-bar-seg"
                        :style="{ width: item.percent + '%', background: item.color }"></div>
                </div>
                <div class="storage-bar-labels">
                    <template v-for="item in storageItems" :key="item.key">
                        <span v-if="item.percent > 5" class="bar-label" :style="{ color: item.color }">
                            {{ item.label }}
                        </span>
                    </template>
                </div>
            </div>

            <div class="section-label-sm">推荐操作</div>
            <div class="settings-group">
                <div v-if="recommendations.length === 0" class="rec-empty">
                    存储空间使用正常，无需清理 ✓
                </div>
                <div v-for="rec in recommendations" :key="rec.key" class="settings-group-item action-item rec-item"
                    @click="rec.action">
                    <div class="rec-icon" :style="{ background: rec.color + '22' }">
                        <span style="font-size:16px;">{{ rec.emoji }}</span>
                    </div>
                    <div class="sgi-label-wrap">
                        <div class="sgi-label">{{ rec.title }}</div>
                        <div class="sgi-desc">{{ rec.desc }}</div>
                    </div>
                    <div class="rec-badge" :style="{ background: rec.color + '22', color: rec.color }">
                        {{ rec.badge }}
                    </div>
                </div>
            </div>

            <div class="section-label-sm">数据管理</div>
            <div class="settings-group">
                <div class="settings-group-item action-item" @click="showExportPanel = !showExportPanel">
                    <div class="sgi-icon-wrap" style="background: linear-gradient(135deg, #98CBEA, #70b0d8);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                    </div>
                    <div class="sgi-label">导出数据</div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                        class="sgi-arrow" :style="{ transform: showExportPanel ? 'rotate(90deg)' : '' }">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </div>
                <template v-if="showExportPanel">
                    <div class="export-options">
                        <div class="export-option" v-for="opt in exportOptions" :key="opt.key">
                            <label class="export-check">
                                <input type="checkbox" v-model="opt.checked" />
                                <span class="export-check-box"></span>
                            </label>
                            <div class="export-opt-info">
                                <span class="export-opt-label">{{ opt.label }}</span>
                                <span class="export-opt-desc">{{ opt.desc }}</span>
                            </div>
                        </div>
                    </div>
                    <div class="settings-group-item action-item" @click="exportData">
                        <div class="sgi-label" style="color:#6BAF7A;">确认导出选中项</div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="#6BAF7A" stroke-width="2" stroke-linecap="round"
                            class="sgi-arrow">
                            <path d="M9 18l6-6-6-6" />
                        </svg>
                    </div>
                </template>
                <div class="settings-group-item action-item" @click="triggerImport">
                    <div class="sgi-icon-wrap" style="background: linear-gradient(135deg, #D8CDEA, #b8a8d8);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                    </div>
                    <div class="sgi-label">导入数据</div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                        class="sgi-arrow">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </div>
                <input type="file" ref="importInput" accept=".json" style="display:none" @change="importData" />
            </div>

            <div class="section-label-sm">系统运行模式</div>
            <div class="settings-group">
                <div class="settings-group-item">
                    <div class="sgi-icon-wrap" style="background: linear-gradient(135deg, #a18cd1, #fbc2eb);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                    </div>
                    <div class="sgi-label-wrap">
                        <div class="sgi-label">纯本地记忆模式 (Local)</div>
                        <div class="sgi-desc">开启后，记忆完全在浏览器本地提取和保存，极速且保护隐私。</div>
                    </div>
                    <label class="toggle-sm">
                        <input type="checkbox" v-model="isLocalModeEnabled" @change="handleModeToggle" />
                        <span class="slider-sm"></span>
                    </label>
                </div>
            </div>

            <!-- 同步状态：仅 personal 版且有待同步时显示 -->
            <template v-if="features.cloudSync && showSyncStatus">
                <div class="section-label-sm">同步状态</div>
                <div class="sync-status-card">
                    <div class="sync-card-header">
                        <div class="sync-icon" :class="{ 'sync-spinning': isSyncing }">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round">
                                <path d="M23 4v6h-6" />
                                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                            </svg>
                        </div>
                        <div class="sync-card-text">
                            <span class="sync-card-title">{{ syncStatusText }}</span>
                            <span class="sync-card-sub">{{ syncSubText }}</span>
                        </div>
                    </div>
                    <button v-if="!isSyncing && pendingCount > 0" class="sync-upload-btn" @click="manualSync">
                        立即上传
                    </button>
                </div>
            </template>

            <!-- 云端与维护：仅 personal 版显示 -->
            <template v-if="features.cloudSync">
                <div class="section-label-sm">云端与维护</div>
                <div class="settings-group">
                    <div class="settings-group-item action-item" @click="syncToCloud">
                        <div class="sgi-icon-wrap" style="background: linear-gradient(135deg, #7ed6a0, #5bc280);">
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
                                <polyline points="16 16 12 12 8 16" />
                                <line x1="12" y1="12" x2="12" y2="21" />
                                <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                            </svg>
                        </div>
                        <div class="sgi-label-wrap">
                            <div class="sgi-label">上传至云端</div>
                            <div class="sgi-desc">清除旧缓存，重新同步最新数据</div>
                        </div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" class="sgi-arrow">
                            <path d="M9 18l6-6-6-6" />
                        </svg>
                    </div>
                    <div class="settings-group-item action-item" @click="forceSync">
                        <div class="sgi-icon-wrap" style="background: linear-gradient(135deg, #F5EAD0, #e8d5a8);">
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
                                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                <path d="M3 3v5h5" />
                            </svg>
                        </div>
                        <div class="sgi-label-wrap">
                            <div class="sgi-label">强制同步</div>
                            <div class="sgi-desc">从云端读取最新数据，覆盖本地缓存</div>
                        </div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" class="sgi-arrow">
                            <path d="M9 18l6-6-6-6" />
                        </svg>
                    </div>
                    <div class="settings-group-item action-item" @click="resetToCloud">
                        <div class="sgi-icon-wrap" style="background: linear-gradient(135deg, #B8D4C8, #8cc0a8);">
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
                                <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
                            </svg>
                        </div>
                        <div class="sgi-label-wrap">
                            <div class="sgi-label">以云端为准</div>
                            <div class="sgi-desc">清除所有本地缓存，重新从云端加载数据</div>
                        </div>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round" class="sgi-arrow">
                            <path d="M9 18l6-6-6-6" />
                        </svg>
                    </div>
                </div>
            </template>

            <!-- 强制刷新：所有版本都显示 -->
            <div class="section-label-sm">维护</div>
            <div class="settings-group">
                <div class="settings-group-item action-item" @click="forceRefreshPage">
                    <div class="sgi-icon-wrap" style="background: linear-gradient(135deg, #A8D8EA, #72c2e0);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
                            <path d="M23 4v6h-6" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                    </div>
                    <div class="sgi-label-wrap">
                        <div class="sgi-label">强制刷新页面</div>
                        <div class="sgi-desc">清除浏览器缓存并重新加载最新版本</div>
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                        class="sgi-arrow">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </div>
            </div>

            <!-- 离线与应急 -->
            <div class="section-label-sm">离线与应急</div>
            <div class="settings-group">
                <div class="settings-group-item">
                    <div class="sgi-label-wrap">
                        <div class="sgi-label">手动离线模式</div>
                        <div class="sgi-desc">强制使用本地模式，请求全部入队等待云端恢复</div>
                    </div>
                    <label class="toggle-sm">
                        <input type="checkbox" v-model="manualOffline" @change="onManualOfflineChange" />
                        <span class="slider-sm"></span>
                    </label>
                </div>
                <div v-if="manualOffline" class="settings-group-item">
                    <div class="sgi-label-wrap">
                        <div class="sgi-label">应急模式</div>
                        <div class="sgi-desc">使用本地缓存的人设+记忆生成即时回复，不等待云端</div>
                    </div>
                    <label class="toggle-sm">
                        <input type="checkbox" v-model="emergencyMode" />
                        <span class="slider-sm"></span>
                    </label>
                </div>
                <!-- 上传应急对话仅 personal 版显示 -->
                <div v-if="features.cloudSync" class="settings-group-item col-item">
                    <div class="sgi-label-wrap">
                        <div class="sgi-label">上传应急对话</div>
                        <div class="sgi-desc">将应急期间产生的对话同步到云端，建议在云端恢复后操作。</div>
                    </div>
                    <button class="upload-btn" :disabled="uploading" @click="uploadEmergencyMessages">
                        {{ uploading ? '上传中...' : '上传应急对话' }}
                    </button>
                    <div v-if="uploadResult" class="upload-result">{{ uploadResult }}</div>
                </div>
            </div>

            <div class="section-label-sm">恢复</div>
            <div class="settings-group">
                <div class="settings-group-item action-item" @click="restoreBuiltinPersonas">
                    <div class="sgi-icon-wrap" style="background: linear-gradient(135deg, #E8C0C9, #d4899e);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                        </svg>
                    </div>
                    <div class="sgi-label-wrap">
                        <div class="sgi-label">恢复内置人格</div>
                        <div class="sgi-desc">恢复被隐藏的系统内置角色</div>
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                        class="sgi-arrow">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </div>
            </div>

            <!-- 数据迁移：仅 personal 版显示 -->
            <template v-if="features.cloudSync">
                <div class="section-label-sm">数据迁移 (Beta)</div>
                <div class="settings-group">
                    <div class="settings-group-item">
                        <div class="sgi-icon-wrap" style="background: linear-gradient(135deg, #88abda, #6f94c9);">
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
                                <path d="M4 12h16M4 12l6 6M4 12l6-6" />
                            </svg>
                        </div>
                        <div class="sgi-label-wrap">
                            <div class="sgi-label">迁移当前助手</div>
                            <div class="sgi-desc">仅将云端数据导入到【{{ personaNameForDisplay }}】</div>
                        </div>
                        <button class="mig-btn primary" @click="handleSingleMigration">迁移当前</button>
                    </div>
                    <div class="settings-group-item">
                        <div class="sgi-icon-wrap" style="background: linear-gradient(135deg, #c98888, #b86f6f);">
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                            </svg>
                        </div>
                        <div class="sgi-label-wrap">
                            <div class="sgi-label">迁移所有助手</div>
                            <div class="sgi-desc danger-text">【高风险】一次性导入所有数据</div>
                        </div>
                        <button class="mig-btn danger" @click="handleFullMigration">全量迁移</button>
                    </div>
                </div>
            </template>

            <div class="section-label-sm">危险操作</div>
            <div class="settings-group">
                <div class="settings-group-item action-item danger-item" @click="nukeAllLocalData">
                    <div class="sgi-icon-wrap" style="background: linear-gradient(135deg, #E8A0A0, #d06060);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path
                                d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            <line x1="10" y1="11" x2="10" y2="17" />
                            <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                    </div>
                    <div class="sgi-label-wrap">
                        <div class="sgi-label danger-label">强制删除所有本地数据</div>
                        <div class="sgi-desc">彻底清空本地存储、缓存，恢复初始状态</div>
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                        class="sgi-arrow">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </div>
            </div>

            <Transition name="toast-fade">
                <div v-if="resultMsg" class="result-bar" :class="resultSuccess ? 'success' : 'error'">
                    {{ resultMsg }}
                </div>
            </Transition>

        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { api, isCloudDown, pendingSyncCount, getPendingSync } from '@/utils/api'
import { manualOffline, setManualOffline, emergencyMode } from '@/utils/emergencyMode'
import { useChatStore } from '@/stores/chat'
import { useRoute } from 'vue-router'
import { startSingleMigration, startFullMigration } from '@/utils/migrate.js'
import { features } from '@/utils/features'

const importInput = ref(null)
const resultMsg = ref('')
const resultSuccess = ref(true)
const showExportPanel = ref(false)
const isSyncing = ref(false)
const uploading = ref(false)
const uploadResult = ref('')
const route = useRoute()
const chatStore = useChatStore()
const personaName = ref('未知助手')

const isLocalModeEnabled = ref(
    localStorage.getItem('force_local_mode') !== null
        ? localStorage.getItem('force_local_mode') === 'true'
        : import.meta.env.VITE_APP_MODE === 'local'
)

const personaIdFromRoute = computed(() => route.params.personaId)
const personaNameForDisplay = computed(() =>
    personaName.value !== '未知助手' ? personaName.value : (personaIdFromRoute.value || '当前助手')
)

const showSyncStatus = computed(() => {
    return features.cloudSync && (isCloudDown.value || pendingSyncCount.value > 0)
})

const pendingCount = computed(() => pendingSyncCount.value)
const syncStatusText = computed(() => {
    if (isSyncing.value) return '正在同步'
    if (isCloudDown.value) return '离线模式'
    if (pendingCount.value > 0) return `待同步 ${pendingCount.value} 条`
    return '同步正常'
})
const syncSubText = computed(() => {
    if (isSyncing.value) return '正在上传数据到云端...'
    if (isCloudDown.value && pendingCount.value > 0) return '云端不可用，数据已保存在本地'
    if (isCloudDown.value) return '云端暂时不可用'
    if (pendingCount.value > 0) return '点击按钮上传到云端'
    return '所有数据已同步'
})

const storageItems = ref([
    { key: 'messages', label: '聊天记录', color: '#E8C0C9', size: 0, percent: 0 },
    { key: 'personas', label: '角色人设', color: '#D8CDEA', size: 0, percent: 0 },
    { key: 'userProfile', label: '用户人设', color: '#98CBEA', size: 0, percent: 0 },
    { key: 'memories', label: '记忆', color: '#F5EAD0', size: 0, percent: 0 },
    { key: 'worldBooks', label: '世界书', color: '#B8D4C8', size: 0, percent: 0 },
    { key: 'calendar', label: '日历', color: '#F1DADD', size: 0, percent: 0 },
    { key: 'media', label: '媒体/头像', color: '#C8C8E8', size: 0, percent: 0 },
    { key: 'other', label: '其他', color: '#D4C8CA', size: 0, percent: 0 },
])

const exportOptions = ref([
    { key: 'messages', label: '聊天记录', desc: '所有角色的对话数据', checked: true },
    { key: 'memories', label: '记忆库', desc: '长期印象、碎片、弧线', checked: true },
    { key: 'worldbooks', label: '世界书', desc: '所有世界书内容', checked: true },
    { key: 'personas', label: '角色设定', desc: '自定义角色和配置', checked: true },
    { key: 'timeline', label: '时间线', desc: '时间线事件记录', checked: true },
    { key: 'settings', label: '本地设置', desc: '主题、壁纸、API配置等', checked: false },
])

const totalUsed = computed(() => storageItems.value.reduce((a, b) => a + b.size, 0))

const pieSegments = computed(() => {
    const total = totalUsed.value || 1
    const circumference = 2 * Math.PI * 38
    let offset = 0
    return storageItems.value.map(item => {
        const dash = (item.size / total) * circumference
        const seg = { color: item.color, dash, gap: circumference - dash, offset: circumference - offset }
        offset += dash
        return seg
    })
})

const recommendations = computed(() => {
    const recs = []
    const msgs = storageItems.value.find(i => i.key === 'messages')
    const mems = storageItems.value.find(i => i.key === 'memories')
    const media = storageItems.value.find(i => i.key === 'media')
    if (msgs?.size > 500) recs.push({ key: 'clear_messages', emoji: '💬', title: '清理旧聊天记录', desc: `聊天记录占用 ${msgs.size}KB`, badge: `${msgs.size}KB`, color: '#E8C0C9', action: () => { } })
    if (mems?.size > 200) recs.push({ key: 'compress_memory', emoji: '🧠', title: '压缩记忆数据', desc: `记忆占用 ${mems.size}KB，建议触发一次记忆整理`, badge: `${mems.size}KB`, color: '#F5EAD0', action: () => { } })
    if (media?.size > 300) recs.push({ key: 'clear_media', emoji: '🖼️', title: '清理媒体缓存', desc: `媒体文件占用 ${media.size}KB，可清理头像缓存`, badge: `${media.size}KB`, color: '#C8C8E8', action: () => { } })
    return recs
})

function showResult(msg, success = true) {
    resultMsg.value = msg
    resultSuccess.value = success
    setTimeout(() => { resultMsg.value = '' }, 3000)
}

function calcSize(str) {
    if (!str) return 0
    return Math.round(new Blob([str]).size / 1024 * 10) / 10
}

function loadStorageStats() {
    const keys = Object.keys(localStorage)
    let messages = 0, personas = 0, userProfile = 0, memories = 0, worldBooks = 0, calendar = 0, media = 0, other = 0
    keys.forEach(key => {
        const val = localStorage.getItem(key) || ''
        const size = calcSize(val)
        if (['messages', 'messages_beta'].some(k => key.includes(k))) messages += size
        else if (['api_config', 'api_configs', 'sub_api', 'custom_personas'].some(k => key.includes(k))) personas += size
        else if (['user_name', 'user_phone', 'user_bio', 'user_background', 'user_relation'].some(k => key.includes(k))) userProfile += size
        else if (['word_cards', 'memories', 'memory'].some(k => key.includes(k))) memories += size
        else if (key.includes('world_book') || key.includes('worldbook')) worldBooks += size
        else if (['calendar_data', 'period_data', 'together_start_date'].some(k => key.includes(k))) calendar += size
        else if (['wallpaper', 'avatar', 'font', 'icon'].some(k => key.includes(k))) media += size
        else other += size
    })
    storageItems.value[0].size = Math.round(messages)
    storageItems.value[1].size = Math.round(personas)
    storageItems.value[2].size = Math.round(userProfile)
    storageItems.value[3].size = Math.round(memories)
    storageItems.value[4].size = Math.round(worldBooks)
    storageItems.value[5].size = Math.round(calendar)
    storageItems.value[6].size = Math.round(media)
    storageItems.value[7].size = Math.round(other)
    const total = storageItems.value.reduce((a, b) => a + b.size, 0) || 1
    storageItems.value.forEach(item => { item.percent = Math.round((item.size / total) * 100) })
}

function handleModeToggle(e) {
    const isLocal = e.target.checked
    localStorage.setItem('force_local_mode', isLocal ? 'true' : 'false')
    alert(`已切换为 ${isLocal ? '【纯本地模式】' : '【云端同步模式】'}。\n页面即将刷新以应用更改。`)
    window.location.reload()
}

function onManualOfflineChange() {
    setManualOffline(manualOffline.value)
}

async function manualSync() {
    if (isSyncing.value) return
    isSyncing.value = true
    try {
        const BASE = import.meta.env.VITE_API_URL || ''
        const pending = getPendingSync()
        let success = 0
        for (const item of pending) {
            try {
                const res = await fetch(`${BASE}${item.path}`, {
                    method: item.method || 'POST',
                    headers: { 'Content-Type': 'application/json', ...item.headers },
                    body: JSON.stringify(item.body)
                })
                if (res.ok) success++
                else break
            } catch { break }
        }
        if (success === pending.length) {
            localStorage.removeItem('melt_pending_sync')
            pendingSyncCount.value = 0
            showResult('全部同步完成 ✓')
        } else {
            const remaining = pending.slice(success)
            localStorage.setItem('melt_pending_sync', JSON.stringify(remaining))
            pendingSyncCount.value = remaining.length
            showResult(`已同步 ${success}/${pending.length} 条`)
        }
    } finally {
        isSyncing.value = false
    }
}

async function uploadEmergencyMessages() {
    if (isCloudDown.value) { uploadResult.value = '云端仍不可用，请稍后再试。'; return }
    const personaId = personaIdFromRoute.value
    if (!personaId) { uploadResult.value = '请先进入某个角色的聊天页面，再回来操作。'; return }
    uploading.value = true
    uploadResult.value = ''
    try {
        const allMsgs = chatStore.allMessages || []
        const emergencyMsgs = allMsgs.filter(m => m.source === 'emergency')
        if (emergencyMsgs.length === 0) { uploadResult.value = '没有应急消息需要上传。'; return }
        let uploaded = 0
        for (const msg of emergencyMsgs) {
            await api(`/api/messages/${personaId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role: msg.role, content: msg.content, timestamp: msg.timestamp, skip_ai_reply: true, source: 'emergency_sync' })
            })
            uploaded++
        }
        emergencyMsgs.forEach(m => { m.source = 'emergency_synced' })
        uploadResult.value = `成功上传 ${uploaded} 条应急消息！`
    } catch (e) {
        uploadResult.value = '上传失败，请检查网络或稍后再试。'
    } finally {
        uploading.value = false
    }
}

async function exportData() {
    try {
        const selected = exportOptions.value.filter(o => o.checked).map(o => o.key)
        if (selected.length === 0) { showResult('请至少选择一项', false); return }
        const exportPayload = { _meta: { exportTime: new Date().toISOString(), version: '1.0', mode: localStorage.getItem('force_local_mode') === 'true' ? 'local' : 'cloud' } }
        const allKeys = Object.keys(localStorage)
        if (selected.includes('messages')) {
            exportPayload.messages = {}
            allKeys.filter(k => k.startsWith('messages_')).forEach(k => { try { exportPayload.messages[k] = JSON.parse(localStorage.getItem(k)) } catch { exportPayload.messages[k] = localStorage.getItem(k) } })
        }
        if (selected.includes('memories')) {
            exportPayload.memories = {}
            allKeys.filter(k => k.startsWith('memories_') || k.startsWith('fragments_') || k.startsWith('arcs_') || k.startsWith('profile_summary_') || k.startsWith('insights_') || k.startsWith('ctx_memory_')).forEach(k => { try { exportPayload.memories[k] = JSON.parse(localStorage.getItem(k)) } catch { exportPayload.memories[k] = localStorage.getItem(k) } })
        }
        if (selected.includes('timeline')) {
            exportPayload.timeline = {}
            allKeys.filter(k => k.startsWith('timeline_')).forEach(k => { try { exportPayload.timeline[k] = JSON.parse(localStorage.getItem(k)) } catch { exportPayload.timeline[k] = localStorage.getItem(k) } })
        }
        if (selected.includes('worldbooks')) exportPayload.worldbooks = JSON.parse(localStorage.getItem('local_worldbooks') || '[]')
        if (selected.includes('personas')) {
            exportPayload.personas = JSON.parse(localStorage.getItem('local_personas') || '[]')
            exportPayload.personaExtras = {}
            allKeys.filter(k => k.startsWith('ctx_persona_') || k.startsWith('chat_custom_themes_')).forEach(k => { try { exportPayload.personaExtras[k] = JSON.parse(localStorage.getItem(k)) } catch { exportPayload.personaExtras[k] = localStorage.getItem(k) } })
        }
        if (selected.includes('settings')) {
            exportPayload.settings = {}
            const excludePatterns = ['avatar', 'wallpaper', 'ctx_', 'emotion_calc']
            allKeys.forEach(k => {
                if (excludePatterns.some(p => k.includes(p))) return
                if (k.startsWith('messages_') || k.startsWith('memories_') || k.startsWith('fragments_') || k.startsWith('arcs_') || k.startsWith('timeline_') || k.startsWith('insights_')) return
                exportPayload.settings[k] = localStorage.getItem(k)
            })
        }
        const isLocal = localStorage.getItem('force_local_mode') === 'true'
        if (!isLocal) {
            try { const res = await api('/api/export?modules=' + selected.join(',')); exportPayload._serverData = await res.json() } catch { exportPayload._serverData = null }
        }
        const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `melt-${selected.length === exportOptions.value.length ? 'full' : selected.join('+')}-${new Date().toISOString().slice(0, 10)}.json`
        a.click()
        URL.revokeObjectURL(url)
        showExportPanel.value = false
        showResult('导出成功 ✓')
    } catch (e) { showResult('导出失败: ' + e.message, false) }
}

function triggerImport() { importInput.value?.click() }

async function importData(event) {
    const file = event.target.files[0]
    if (!file) return
    try {
        const data = JSON.parse(await file.text())
        if (data._meta) {
            if (data.messages) Object.entries(data.messages).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)))
            if (data.memories) Object.entries(data.memories).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)))
            if (data.timeline) Object.entries(data.timeline).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)))
            if (data.worldbooks) localStorage.setItem('local_worldbooks', JSON.stringify(data.worldbooks))
            if (data.personas) localStorage.setItem('local_personas', JSON.stringify(data.personas))
            if (data.personaExtras) Object.entries(data.personaExtras).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)))
            if (data.settings) {
                const skipKeys = ['local_api_config', 'sub_api_key', 'force_local_mode']
                Object.entries(data.settings).forEach(([k, v]) => { if (!skipKeys.includes(k) && v != null) localStorage.setItem(k, v) })
            }
            if (data._serverData && Object.keys(data._serverData).length > 0) {
                try { await api('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data._serverData) }) } catch { }
            }
            showResult('导入成功，刷新页面生效 ✓')
            return
        }
        if (data.localSettings) Object.entries(data.localSettings).forEach(([k, v]) => { if (v) localStorage.setItem(k, v) })
        const serverData = { ...data }
        delete serverData.localSettings
        if (Object.keys(serverData).length > 0) await api('/api/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serverData) })
        showResult('导入成功，刷新页面生效 ✓')
    } catch (e) { showResult('导入失败: ' + e.message, false) }
}

async function syncToCloud() {
    if (!confirm('上传至云端会清除旧缓存并重新同步最新数据，确定继续？')) return
    showResult('正在同步...')
    try {
        sessionStorage.clear()
        const keysToRemove = Object.keys(localStorage).filter(k => k.startsWith('melt_cache_') || k.startsWith('cached_') || ['home_data_loaded', 'personas_loaded'].includes(k))
        keysToRemove.forEach(k => localStorage.removeItem(k))
        const [personasRes, latestRes] = await Promise.all([api('/api/prompts/personas'), api('/api/messages/latest-persona')])
        const latestData = await latestRes.json()
        const pid = latestData.personaId
        if (pid) {
            const [msgRes, tlRes, insRes, hmRes] = await Promise.all([api(`/api/messages/${pid}/last`), api(`/api/timeline/${pid}`), api(`/api/sediment/${pid}/insights`), api(`/api/memories/${pid}/heatmap`)])
            const lastMsg = await msgRes.json()
            if (lastMsg) { const content = lastMsg.content.split('|||')[0].replace(/\n/g, ' '); localStorage.setItem('cached_left_bubble', content.length > 30 ? content.slice(0, 30) + '...' : content) }
            localStorage.setItem('cached_timeline', JSON.stringify(await tlRes.json()))
            localStorage.setItem('cached_insights', JSON.stringify(await insRes.json()))
            const heatmap = await hmRes.json()
            if (heatmap) localStorage.setItem('cached_total_messages', String(Object.values(heatmap).reduce((a, b) => a + b, 0)))
        }
        showResult('已同步最新数据至本地缓存 ✓')
    } catch (e) { showResult('同步失败: ' + e.message, false) }
}

async function forceSync() {
    if (!confirm('强制同步会清除所有本地缓存并从云端重新读取，确定？')) return
    showResult('正在从云端读取...')
    try {
        sessionStorage.clear()
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('melt_cache_') || key.startsWith('cached_') || key.startsWith('together_loaded_') || key.startsWith('insights_loaded_') || key.startsWith('bookmarks_loaded_') || ['home_data_loaded', 'personas_loaded'].includes(key)) localStorage.removeItem(key)
        })
        const res = await api('/api/personas/all')
        if (res.ok) {
            const personas = await res.json()
            localStorage.setItem('local_personas', JSON.stringify(personas.filter(p => p.custom === true)))
        }
        showResult('缓存已清除，正在刷新...')
        setTimeout(() => { location.reload() }, 1200)
    } catch (e) { showResult('同步失败: ' + e.message, false) }
}

async function forceRefreshPage() {
    showResult('正在清除缓存...')
    try {
        if ('caches' in window) { const names = await caches.keys(); await Promise.all(names.map(n => caches.delete(n))) }
        if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())) }
        setTimeout(() => { location.reload() }, 500)
    } catch { location.reload() }
}

async function resetToCloud() {
    if (!confirm('此操作将清除所有本地存储数据，仅保留登录凭证，然后从云端重新加载。确定继续？')) return
    showResult('正在清除本地数据...')
    try {
        const preserveKeys = ['auth_token', 'user_id', 'login_token', 'token', 'userId']
        const preserved = {}
        preserveKeys.forEach(k => { const v = localStorage.getItem(k); if (v) preserved[k] = v })
        localStorage.clear()
        sessionStorage.clear()
        Object.entries(preserved).forEach(([k, v]) => localStorage.setItem(k, v))
        if ('caches' in window) { const names = await caches.keys(); await Promise.all(names.map(n => caches.delete(n))) }
        showResult('本地数据已清除，正在从云端重新加载...')
        setTimeout(() => { location.reload() }, 1200)
    } catch (e) { showResult('操作失败: ' + e.message, false) }
}

async function restoreBuiltinPersonas() {
    try {
        for (const id of ['xiaorou', 'cool', 'assistant']) {
            await api(`/api/personas/builtin/${id}/restore`, { method: 'POST' })
        }
        localStorage.removeItem('hidden_personas')
        showResult('已恢复所有内置人格 ✓')
    } catch (e) { showResult('恢复失败: ' + e.message, false) }
}

async function handleSingleMigration() {
    const pid = personaIdFromRoute.value
    if (!pid) { alert('无法获取当前人格 ID，请从具体的人格详情页进入此功能，或选择"全量迁移"。'); return }
    await startSingleMigration(pid)
}

async function handleFullMigration() { await startFullMigration() }

async function nukeAllLocalData() {
    if (!confirm('⚠️ 危险操作：将彻底删除所有本地数据（包括登录状态），你需要重新登录。确定继续？')) return
    if (!confirm('再次确认：这将清空所有本地存储、缓存，不可恢复。确定？')) return
    try {
        localStorage.clear()
        sessionStorage.clear()
        if ('caches' in window) { const names = await caches.keys(); await Promise.all(names.map(n => caches.delete(n))) }
        if ('serviceWorker' in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map(r => r.unregister())) }
        if ('indexedDB' in window) { const dbs = await indexedDB.databases?.() || []; dbs.forEach(db => { if (db.name) indexedDB.deleteDatabase(db.name) }) }
        alert('所有本地数据已清除，页面将重新加载。')
        location.reload()
    } catch (e) { alert('清除过程出错: ' + e.message + '，将强制刷新。'); location.reload() }
}

onMounted(() => {
    loadStorageStats()
    if (personaIdFromRoute.value) {
        api(`/api/persona/${personaIdFromRoute.value}`).then(r => r.json()).then(d => { if (d?.name) personaName.value = d.name }).catch(() => { })
    }
})
</script>

<style scoped>
.sub-page {
    width: 100%;
    height: 100%;
    padding-top: env(safe-area-inset-top, 44px);
    display: flex;
    flex-direction: column;
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

.settings-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px 4px;
    flex-shrink: 0;
    position: relative;
    z-index: 2;
}

.settings-back {
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

.settings-back svg {
    width: 16px;
    height: 16px;
    stroke: #D9A3AF;
}

.settings-title {
    font-size: 17px;
    font-weight: 800;
    color: #4A3F41;
}

.sub-content {
    flex: 1;
    overflow-y: auto;
    padding: 0 16px;
    padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 32px);
    position: relative;
    z-index: 1;
}

.sub-content::-webkit-scrollbar {
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

/* 存储卡片 */
.storage-card {
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-radius: 22px;
    padding: 18px 16px;
    margin-bottom: 10px;
    box-shadow: 0 8px 24px rgba(217, 163, 175, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.5) inset;
    border: 1px solid rgba(255, 240, 242, 0.4);
}

.storage-total {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-bottom: 16px;
}

.storage-used {
    font-size: 28px;
    font-weight: 800;
    color: #4A3F41;
}

.storage-unit {
    font-size: 13px;
    color: #B8A9AC;
}

/* 圆饼图 */
.pie-wrap {
    display: flex;
    gap: 16px;
    align-items: center;
    margin-bottom: 16px;
}

.pie-svg {
    width: 100px;
    height: 100px;
    flex-shrink: 0;
    transform: rotate(-90deg);
}

.pie-text-group {
    transform: rotate(90deg);
    transform-origin: 50px 50px;
}

.pie-legend {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
}

.legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}

.legend-label {
    font-size: 11px;
    color: #6B5B5E;
    flex: 1;
}

.legend-val {
    font-size: 11px;
    color: #B8A9AC;
    font-weight: 600;
}

/* 分段条 */
.storage-bar {
    display: flex;
    height: 8px;
    border-radius: 4px;
    overflow: hidden;
    margin-bottom: 4px;
}

.storage-bar-seg {
    height: 100%;
    transition: width 0.6s ease;
}

.storage-bar-labels {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
}

.bar-label {
    font-size: 9px;
    font-weight: 600;
}

/* 推荐操作 */
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
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid rgba(217, 163, 175, 0.08);
}

.settings-group-item:last-child {
    border-bottom: none;
}

.action-item {
    cursor: pointer;
    transition: background 0.15s;
}

.action-item:active {
    background: rgba(217, 163, 175, 0.06);
}

.sgi-icon-wrap {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
}

.sgi-icon-wrap svg {
    width: 16px;
    height: 16px;
}

.sgi-label {
    font-size: 14px;
    color: #4A3F41;
    flex-shrink: 0;
}

.sgi-label-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.sgi-desc {
    font-size: 11px;
    color: #B8A9AC;
}

.sgi-arrow {
    width: 14px;
    height: 14px;
    stroke: #D4C8CA;
    flex-shrink: 0;
}

.rec-empty {
    padding: 16px;
    font-size: 13px;
    color: #6BAF7A;
    text-align: center;
}

.rec-item {
    align-items: flex-start;
}

.rec-icon {
    width: 36px;
    height: 36px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.rec-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 10px;
    flex-shrink: 0;
}

.result-bar {
    padding: 10px 14px;
    border-radius: 14px;
    font-size: 12px;
    margin-top: 8px;
}

.result-bar.success {
    color: #6BAF7A;
    background: rgba(107, 175, 122, 0.1);
}

.result-bar.error {
    color: #C07070;
    background: rgba(192, 112, 112, 0.1);
}

.toast-fade-enter-active {
    transition: opacity 0.3s;
}

.toast-fade-leave-active {
    transition: opacity 0.5s;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
    opacity: 0;
}

/* 危险操作 */
.danger-item:active {
    background: rgba(208, 96, 96, 0.06);
}

.danger-label {
    color: #C06060;
}

.export-options {
    padding: 8px 16px 12px;
    border-bottom: 1px solid rgba(217, 163, 175, 0.08);
}

.export-option {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
}

.export-check {
    position: relative;
    display: flex;
    align-items: center;
}

.export-check input {
    opacity: 0;
    width: 0;
    height: 0;
    position: absolute;
}

.export-check-box {
    width: 20px;
    height: 20px;
    border-radius: 6px;
    border: 1.5px solid rgba(217, 163, 175, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    cursor: pointer;
}

.export-check input:checked+.export-check-box {
    background: linear-gradient(135deg, #E8C0C9, #D9A3AF);
    border-color: transparent;
}

.export-check input:checked+.export-check-box::after {
    content: '✓';
    color: white;
    font-size: 12px;
    font-weight: 700;
}

.export-opt-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
}

.export-opt-label {
    font-size: 13px;
    color: #4A3F41;
}

.export-opt-desc {
    font-size: 10px;
    color: #B8A9AC;
}

/* 你可以把这些样式加到 Storage.vue 的 style 标签里 */
.sgi-label-wrap .danger-text {
    color: #ff4d4f;
    font-weight: 500;
}

.action-btn {
    border: none;
    padding: 6px 12px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    flex-shrink: 0;
    transition: background-color 0.2s;
}

.action-btn.primary {
    background-color: #1890ff;
    color: white;
}

.action-btn.primary:active {
    background-color: #096dd9;
}

.action-btn.danger {
    background-color: #ff4d4f;
    color: white;
}

.action-btn.danger:active {
    background-color: #d9363e;
}

/* --- 新增：滑动开关样式 --- */
.toggle-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
}

.toggle-switch input {
    opacity: 0;
    width: 0;
    height: 0;
}

.toggle-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: .3s;
    border-radius: 24px;
}

.toggle-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: .3s;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

input:checked+.toggle-slider {
    background-color: #4cd964;
    /* 开启时的绿色 */
}

input:checked+.toggle-slider:before {
    transform: translateX(20px);
}

.col-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
}

.toggle-sm {
    position: relative;
    width: 44px;
    height: 26px;
    flex-shrink: 0;
}

.toggle-sm input {
    opacity: 0;
    width: 0;
    height: 0;
}

.slider-sm {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(217, 163, 175, 0.2);
    border-radius: 13px;
    transition: 0.28s ease;
}

.slider-sm:before {
    position: absolute;
    content: "";
    height: 22px;
    width: 22px;
    left: 2px;
    bottom: 2px;
    background: white;
    border-radius: 50%;
    transition: 0.28s ease;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.12);
}

.toggle-sm input:checked+.slider-sm {
    background: linear-gradient(135deg, #E8C0C9, #D9A3AF);
}

.toggle-sm input:checked+.slider-sm:before {
    transform: translateX(18px);
}

.sync-status-card {
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-radius: 22px;
    padding: 16px;
    margin-bottom: 10px;
    box-shadow: 0 8px 24px rgba(217, 163, 175, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.5) inset;
    border: 1px solid rgba(255, 240, 242, 0.4);
}

.sync-card-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 12px;
}

.sync-icon {
    width: 36px;
    height: 36px;
    min-width: 36px;
    border-radius: 10px;
    background: linear-gradient(135deg, #F5EAD0, #e8d5a8);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
}

.sync-icon svg {
    width: 16px;
    height: 16px;
}

.sync-icon.sync-spinning svg {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from {
        transform: rotate(0deg);
    }

    to {
        transform: rotate(360deg);
    }
}

.sync-card-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
}

.sync-card-title {
    font-size: 14px;
    font-weight: 600;
    color: #4A3F41;
}

.sync-card-sub {
    font-size: 11px;
    color: #B8A9AC;
}

.sync-upload-btn {
    width: 100%;
    padding: 10px;
    border-radius: 12px;
    border: none;
    background: linear-gradient(135deg, #7ed6a0, #5bc280);
    color: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
}

.upload-btn {
    margin-top: 8px;
    padding: 7px 16px;
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, #E8C0C9, #D9A3AF);
    color: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
}

.upload-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.upload-result {
    margin-top: 6px;
    font-size: 12px;
    color: #B8A9AC;
}

.mig-btn {
    border: none;
    padding: 6px 12px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
    font-family: inherit;
}

.mig-btn.primary {
    background: linear-gradient(135deg, #E8C0C9, #D9A3AF);
    color: white;
}

.mig-btn.danger {
    background: linear-gradient(135deg, #E8A0A0, #d06060);
    color: white;
}

.danger-item:active {
    background: rgba(208, 96, 96, 0.06);
}

.danger-label {
    color: #C06060;
}

.danger-text {
    color: #C06060;
    font-size: 11px;
}
</style>
