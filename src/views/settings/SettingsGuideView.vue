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
            <span class="settings-title">使用说明</span>
            <div style="width:36px;"></div>
        </div>

        <div class="sub-content">

            <!-- 更新公告 -->
            <div class="section-header-row" style="margin-top:12px;">
                <span class="section-label-sm" style="margin-top:0;">最近更新</span>
                <button class="section-link-btn" @click="showAllChangelogs = !showAllChangelogs">
                    {{ showAllChangelogs ? '收起' : '查看历史' }}
                </button>
            </div>

            <!-- 最新公告 -->
            <div class="guide-card">
                <div class="update-header">
                    <div class="update-header-left">
                        <span class="update-version">v{{ changelogs[0].version }}</span>
                        <span class="update-tag" v-if="!readVersions.includes(changelogs[0].version)">NEW</span>
                    </div>
                    <span class="update-date">{{ changelogs[0].date }}</span>
                </div>
                <ul class="update-list">
                    <li v-for="(item, idx) in changelogs[0].items" :key="idx">{{ item }}</li>
                </ul>
            </div>

            <!-- 历史公告列表 -->
            <Transition name="expand-fade">
                <div v-if="showAllChangelogs">
                    <div v-for="log in changelogs.slice(1)" :key="log.version" class="guide-card changelog-history">
                        <div class="update-header">
                            <div class="update-header-left">
                                <span class="update-version-sm">v{{ log.version }}</span>
                            </div>
                            <span class="update-date">{{ log.date }}</span>
                        </div>
                        <ul class="update-list">
                            <li v-for="(item, idx) in log.items" :key="idx">{{ item }}</li>
                        </ul>
                    </div>
                </div>
            </Transition>

            <!-- 使用文档 -->
            <div class="section-label-sm">使用指南</div>
            <div class="settings-group">
                <div v-for="doc in docs" :key="doc.key" class="settings-group-item action-item"
                    @click="expandedDoc = expandedDoc === doc.key ? null : doc.key">
                    <div class="sgi-icon-wrap" :style="{ background: doc.gradient }">
                        <svg :viewBox="'0 0 24 24'" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round"
                            stroke-linejoin="round" style="width:16px;height:16px;" v-html="doc.icon">
                        </svg>
                    </div>
                    <div class="sgi-label-wrap">
                        <div class="sgi-label">{{ doc.title }}</div>
                        <div class="sgi-desc">{{ doc.subtitle }}</div>
                    </div>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
                        class="sgi-arrow" :class="{ 'arrow-expanded': expandedDoc === doc.key }">
                        <path d="M9 18l6-6-6-6" />
                    </svg>
                </div>
            </div>

            <!-- 展开的文档内容 -->
            <Transition name="expand-fade">
                <div v-if="expandedDoc" class="guide-card doc-content">
                    <template v-for="block in currentDocBlocks" :key="block.id">
                        <h4 v-if="block.type === 'h4'">{{ block.text }}</h4>
                        <p v-else-if="block.type === 'p'">{{ block.text }}</p>
                    </template>
                </div>
            </Transition>

            <!-- 待实现功能 -->
            <div class="section-label-sm">功能说明</div>
            <div class="guide-card">
                <p class="about-line" style="color:#B8A9AC;font-size:12px;margin-bottom:10px;">
                    以下功能已在界面中占位，正在探索实现方案，暂时无法使用：</p>
                <div v-for="item in pendingFeatures" :key="item.key" class="pending-item">
                    <div class="pending-icon">
                        <svg v-html="item.icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                            stroke-linecap="round" stroke-linejoin="round"></svg>
                    </div>

                    <div class="pending-info">
                        <span class="pending-title">{{ item.title }}</span>
                        <span class="pending-desc">{{ item.desc }}</span>
                    </div>
                    <span class="pending-badge" :class="{ 'can-local': item.local }">{{ item.badge }}</span>
                </div>
            </div>

            <!-- 关于 -->
            <div class="section-label-sm">关于本项目</div>
            <div class="guide-card about-card">
                <div class="about-avatar">✦</div>
                <p class="about-line">本项目由作者独立完成，非专业开发者出身，内容粗糙在所难免。</p>
                <p class="about-line">很多设计随心而为，精力有限，不保证所有 Bug 都会修复。有能力的欢迎自行二改。</p>
                <div class="about-divider"></div>
                <p class="about-line"><span class="about-tag">免费开源</span>本项目完全免费，已开源。</p>
                <p class="about-line"><span class="about-tag">二改友好</span>允许二传、二改，保留原作者信息即可。</p>
                <p class="about-line"><span class="about-tag">禁止商业</span>不允许任何盈利或倒卖行为。一旦发现，将考虑关闭公开版本。</p>
                <p class="about-line" style="color:#B8A9AC;font-size:11px;margin-top:8px;">—
                    本来只是心血来潮做的东西，很多人喜欢所以才公开了。感谢每一个用到它的人。
                </p>
            </div>

            <!-- 应用信息 -->
            <div class="app-info-footer">
                <div class="app-info-name">Melt</div>
                <div class="app-info-version">版本 {{ changelogs[0].version }} · {{ buildVariant }}</div>
            </div>

            <Transition name="toast-fade">
                <div v-if="toastMsg" class="result-bar success">{{ toastMsg }}</div>
            </Transition>

        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const expandedDoc = ref(null)
const toastMsg = ref('')
const showAllChangelogs = ref(false)
const readVersions = ref([])

const buildVariant = computed(() => {
    const mode = import.meta.env.VITE_APP_MODE || 'personal'
    const map = { personal: 'Personal', local: 'Local', lite: 'Lite' }
    return map[mode] || mode
})

const changelogs = ref([
    {
        version: '1.1.0',
        date: '2026-08-02',
        items: [
            '修复内置角色删除逻辑，支持隐藏后彻底不显示',
            '优化关于记忆显示等名称',
            '日程生成逻辑优化，日历显示更明显',
            '记忆星图生成逻辑优化',
            '（os：这次应该没有问题了，然后下次更新随缘）',
        ]
    },
    {
        version: '1.0.3',
        date: '2026-07-31',
        items: [
            '修复消息重复显示问题',
            '修复切换角色时记忆被错误拦截',
            '优化气泡分句逻辑，支持换行分割',
            '记忆归档只显示有实际内容的日期',
            '记忆单条编辑和删除功能修复',
            '日记重复写入问题修复',
            '备忘录卡片提取为独立组件修复渲染问题',
        ]
    },
    {
        version: '1.0.2',
        date: '2026-07-25',
        items: [
            '本地模式全面切换至 IndexedDB，支持更大数据量',
            '修复了异步存储导致的消息加载问题',
            '优化 API 错误提示，支持显示具体原因',
            'API 配置页支持导出/导入备份',
            '修复副 API 配置删除逻辑',
            '改善后台保活稳定性',
        ]
    },
    {
        version: '1.0.1',
        date: '2026-07-13',
        items: [
            '修复安全区问题',
            '新增存储空间维护工具',
            '添加使用说明页面',
            '优化消息发送稳定性',
        ]
    },
    {
        version: '1.0.0',
        date: '2026-07-10',
        items: [
            '正式发布',
            '支持多角色对话',
            '记忆系统上线',
            '主动消息功能',
        ]
    },
])

const docs = ref([
    {
        key: 'quickstart',
        icon: '<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>',
        title: '快速开始',
        subtitle: '首次使用的基本设置',
        gradient: 'linear-gradient(135deg, #98CBEA, #70b0d8)',
        blocks: [
            { id: 1, type: 'h4', text: '1. 配置 API' },
            { id: 2, type: 'p', text: '进入 设置 → 蓝牙 ，填写你的 API Key、接口地址和模型名称。支持 OpenAI 兼容格式的任意接口。' },
            { id: 3, type: 'h4', text: '2. 选择角色' },
            { id: 4, type: 'p', text: '在首页共语列表选择角色，长按可以置顶、重置或删除。点击右上角"+"可以新建自定义角色。' },
            { id: 5, type: 'h4', text: '3. 开始对话' },
            { id: 6, type: 'p', text: '一切准备就绪，直接发消息即可。local 模式下数据存储在本地浏览器，personal 模式会同步到云端。' },
        ]
    },
    {
        key: 'personas',
        icon: '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>',
        title: '角色与人格',
        subtitle: '如何创建和管理 AI 角色',
        gradient: 'linear-gradient(135deg, #D8CDEA, #b8a8d8)',
        blocks: [
            { id: 1, type: 'h4', text: '内置角色' },
            { id: 2, type: 'p', text: '系统预设了多个角色，每个角色有独立的性格、记忆和对话风格。可以在存储空间页面恢复被隐藏的内置角色。' },
            { id: 3, type: 'h4', text: '自定义角色' },
            { id: 4, type: 'p', text: '在共语列表点击"+"按钮创建自定义角色，支持设置名称、头像、角色设定等。' },
            { id: 5, type: 'h4', text: '世界书' },
            { id: 6, type: 'p', text: '世界书可以为角色补充背景设定，当对话触发关键词时自动注入上下文。在设置 → 世界书中管理。' },
        ]
    },
    {
        key: 'memory',
        icon: '<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>',
        title: '记忆系统',
        subtitle: '了解 AI 如何记住你',
        gradient: 'linear-gradient(135deg, #F5EAD0, #e8d5a8)',
        blocks: [
            { id: 1, type: 'h4', text: '自动记忆' },
            { id: 2, type: 'p', text: '对话过程中，系统会自动提取重要信息存入记忆。记忆按情感权重排序，越重要的记忆越容易被想起。' },
            { id: 3, type: 'h4', text: '记忆整理' },
            { id: 4, type: 'p', text: '系统会定期对记忆进行压缩整理。可以在设置 → 记忆管理中调整触发频率和模块开关。' },
            { id: 5, type: 'h4', text: '手动管理' },
            { id: 6, type: 'p', text: '在关于他页面可以查看时间线、侧写等记忆内容，支持手动编辑和删除。' },
        ]
    },
    {
        key: 'storage',
        icon: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
        title: '数据与同步',
        subtitle: '本地缓存和云端备份',
        gradient: 'linear-gradient(135deg, #B8D4C8, #8cc0a8)',
        blocks: [
            { id: 1, type: 'h4', text: '导出/导入' },
            { id: 2, type: 'p', text: '在设置 → 存储空间可以导出所有数据为 JSON 文件，也可以从备份文件恢复。换设备时使用。' },
            { id: 3, type: 'h4', text: '故障恢复' },
            { id: 4, type: 'p', text: '如果遇到数据异常，可以使用维护工具中的"以云端为准"或"强制刷新"来恢复正常状态。' },
        ]
    },

])

const pendingFeatures = ref([
    {
        key: 'proactive',
        icon: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
        title: '主动消息与后台通知',
        desc: 'PWA 无法实现真正的后台推送。添加到主屏幕后需保持应用在后台运行才能触发主动消息，关闭后无效',
        badge: '受限',
        local: false
    },
    {
        key: 'wechat',
        icon: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
        title: '微信同步',
        desc: '与微信消息双向同步，受平台限制',
        badge: '受限',
        local: false
    },
])

const currentDocBlocks = computed(() => {
    const doc = docs.value.find(d => d.key === expandedDoc.value)
    return doc ? doc.blocks : []
})

onMounted(() => {
    const stored = localStorage.getItem('read_changelogs')
    readVersions.value = stored ? JSON.parse(stored) : []
    const latest = changelogs.value[0].version
    if (!readVersions.value.includes(latest)) {
        readVersions.value.push(latest)
        localStorage.setItem('read_changelogs', JSON.stringify(readVersions.value))
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

.section-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-right: 4px;
    margin-top: 20px;
    margin-bottom: 0;
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

.section-link-btn {
    font-size: 11px;
    color: #D9A3AF;
    background: none;
    border: none;
    cursor: pointer;
    padding: 0 4px 8px;
    font-family: inherit;
    font-weight: 600;
}

.guide-card {
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border-radius: 22px;
    padding: 18px 16px;
    margin-bottom: 10px;
    box-shadow: 0 8px 24px rgba(217, 163, 175, 0.1), 0 0 0 1px rgba(255, 255, 255, 0.5) inset;
    border: 1px solid rgba(255, 240, 242, 0.4);
}

.changelog-history {
    opacity: 0.75;
}

.update-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
}

.update-header-left {
    display: flex;
    align-items: center;
    gap: 7px;
}

.update-version {
    font-size: 14px;
    font-weight: 700;
    background: linear-gradient(135deg, #E8C0C9, #D8CDEA);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.update-version-sm {
    font-size: 13px;
    font-weight: 600;
    color: #B8A9AC;
}

.update-tag {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: white;
    background: linear-gradient(135deg, #E8C0C9, #D9A3AF);
    border-radius: 5px;
    padding: 2px 5px;
}

.update-date {
    font-size: 11px;
    color: #B8A9AC;
}

.update-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.update-list li {
    font-size: 13px;
    color: #6B5B5E;
    padding: 5px 0;
    padding-left: 16px;
    position: relative;
}

.update-list li::before {
    content: '•';
    position: absolute;
    left: 0;
    color: #D9A3AF;
    font-weight: 700;
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

.sgi-label-wrap {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.sgi-label {
    font-size: 14px;
    color: #4A3F41;
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
    transition: transform 0.25s ease;
}

.arrow-expanded {
    transform: rotate(90deg);
}

.doc-content {
    font-size: 13px;
    color: #6B5B5E;
    line-height: 1.7;
}

.doc-content h4 {
    font-size: 13px;
    font-weight: 700;
    color: #4A3F41;
    margin: 14px 0 6px;
}

.doc-content h4:first-child {
    margin-top: 0;
}

.doc-content p {
    margin: 0 0 8px;
}

.app-info-footer {
    text-align: center;
    padding: 28px 0 12px;
}

.app-info-name {
    font-size: 16px;
    font-weight: 800;
    background: linear-gradient(135deg, #E8C0C9, #D8CDEA);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.app-info-version {
    font-size: 11px;
    color: #B8A9AC;
    margin-top: 4px;
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

.expand-fade-enter-active {
    transition: opacity 0.3s ease;
}

.expand-fade-leave-active {
    transition: opacity 0.2s ease;
}

.expand-fade-enter-from,
.expand-fade-leave-to {
    opacity: 0;
}

.about-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.about-avatar {
    font-size: 24px;
    text-align: center;
    margin-bottom: 4px;
    color: #D9A3AF;
}

.about-line {
    font-size: 13px;
    color: #6B5B5E;
    line-height: 1.7;
    margin: 0;
}

.about-tag {
    display: inline-block;
    font-size: 10px;
    font-weight: 700;
    color: #D9A3AF;
    background: rgba(217, 163, 175, 0.12);
    border-radius: 6px;
    padding: 2px 7px;
    margin-right: 6px;
    letter-spacing: 0.3px;
}

.about-divider {
    border-top: 1px dashed rgba(217, 163, 175, 0.2);
    margin: 4px 0;
}

.pending-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(217, 163, 175, 0.06);
}

.pending-item:last-child {
    border-bottom: none;
    padding-bottom: 0;
}

.pending-icon {
    width: 32px;
    height: 32px;
    border-radius: 9px;
    background: rgba(217, 163, 175, 0.08);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.pending-icon svg {
    width: 16px;
    height: 16px;
    stroke: #D9A3AF;
}

.pending-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.pending-title {
    font-size: 13px;
    color: #4A3F41;
    font-weight: 500;
}

.pending-desc {
    font-size: 11px;
    color: #B8A9AC;
    line-height: 1.4;
}

.pending-badge {
    font-size: 10px;
    color: #B8A9AC;
    background: rgba(217, 163, 175, 0.1);
    border-radius: 6px;
    padding: 2px 7px;
    flex-shrink: 0;
    white-space: nowrap;
}

.pending-badge.can-local {
    color: #6BAF7A;
    background: rgba(107, 175, 122, 0.1);
}
</style>
