<template>
    <div class="memo-card" :class="[{ 'memo-list-item': viewMode === 'list', 'ai-memo-card': isAi }]"
        :style="{ background: memo.color || 'rgba(255,255,255,0.55)' }" @click="$emit('click')">
        <div class="memo-card-header">
            <span class="memo-card-date">{{ formatDate(memo.updatedAt || memo.createdAt) }}</span>
            <button class="memo-card-delete" @click.stop="$emit('delete')">×</button>
        </div>
        <p v-if="memo.title" class="memo-card-title">{{ memo.title }}</p>
        <p class="memo-card-body">{{ memo.content }}</p>
        <div v-if="memo.images && memo.images.length > 0" class="memo-card-imgs">
            <img v-for="(img, idx) in displayImages" :key="idx" :src="img" />
            <div v-if="memo.images.length > maxShow" class="memo-img-more">
                +{{ memo.images.length - maxShow }}
            </div>
        </div>
        <div v-if="memo.tags && memo.tags.length > 0" class="memo-card-tags">
            <span v-for="tag in memo.tags" :key="tag" class="memo-tag">#{{ tag }}</span>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
    memo: Object,
    viewMode: { type: String, default: 'grid' },
    isAi: { type: Boolean, default: false },
})

defineEmits(['click', 'delete'])

const maxShow = computed(() => props.viewMode === 'list' ? 4 : 3)
const displayImages = computed(() => props.memo.images?.slice(0, maxShow.value) || [])

function formatDate(ts) {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d
    const days = Math.floor(diff / 86400000)
    if (days === 0) return `今天 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    if (days === 1) return '昨天'
    if (days < 7) return `${days}天前`
    return `${d.getMonth() + 1}月${d.getDate()}日`
}
</script>

<style scoped>
.memo-card {
    border-radius: 20px;
    padding: 14px;
    cursor: pointer;
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.6);
    box-shadow: 0 4px 16px rgba(217, 163, 175, 0.08);
    transition: transform 0.15s;
    min-height: 100px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.memo-list-item {
    min-height: auto;
    flex-direction: row;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 8px;
    border-radius: 16px;
}

.memo-card:active {
    transform: scale(0.97);
}

.ai-memo-card {
    border: 1px solid rgba(217, 163, 175, 0.2);
}

.memo-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.memo-card-date {
    font-size: 10px;
    color: #B8A9AC;
}

.memo-card-delete {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(217, 163, 175, 0.15);
    border: none;
    font-size: 14px;
    color: #B8A9AC;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
}

.memo-card:active .memo-card-delete {
    opacity: 1;
}

.memo-card-title {
    font-size: 13px;
    font-weight: 700;
    color: #4A3F41;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.memo-card-body {
    font-size: 12px;
    color: #6B5B5E;
    line-height: 1.6;
    flex: 1;
    display: -webkit-box;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.memo-list-item .memo-card-body {
    line-clamp: 2;
    -webkit-line-clamp: 2;
}

.memo-card-imgs {
    display: flex;
    gap: 4px;
    margin-top: 4px;
}

.memo-card-imgs img {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    object-fit: cover;
}

.memo-img-more {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    background: rgba(217, 163, 175, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: #B8A9AC;
}

.memo-card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 2px;
}

.memo-tag {
    font-size: 10px;
    color: #D9A3AF;
    background: rgba(217, 163, 175, 0.1);
    padding: 2px 7px;
    border-radius: 8px;
}
</style>
