<template>
    <Transition name="lock-fade">
        <div v-if="visible" class="lockscreen">
            <div class="lock-blob lb-tl"></div>
            <div class="lock-blob lb-br"></div>
            <div class="lock-blob lb-mid"></div>

            <div class="lock-top">
                <div class="lock-time">{{ timeStr }}</div>
                <div class="lock-date">{{ dateStr }}</div>

                <div class="lock-persona">
                    <div class="lock-avatar">
                        <img v-if="aiAvatarUrl" :src="aiAvatarUrl" />
                        <span v-else>{{ aiAvatar }}</span>
                    </div>
                    <div class="lock-greeting">{{ greeting }}</div>
                </div>
            </div>

            <div class="lock-pin-area">
                <div class="lock-pin-label" :class="{ 'has-error': hasError }">
                    {{ errorMsg || '请输入密码' }}
                </div>
                <div class="lock-dots">
                    <div v-for="i in 4" :key="i" class="lock-dot"
                        :class="{ filled: pin.length >= i, error: hasError }">
                    </div>
                </div>
            </div>

            <div class="lock-keyboard">
                <button v-for="n in [1,2,3,4,5,6,7,8,9,'',0,'⌫']" :key="n"
                    class="lock-key"
                    :class="{ 'lock-key-empty': n === '', 'lock-key-del': n === '⌫' }"
                    @click="onKey(n)">
                    <span class="lock-key-num">{{ n !== '' ? n : '' }}</span>
                </button>
            </div>

            <div class="lock-bottom-spacer"></div>
        </div>
    </Transition>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const visible = ref(false)
const pin = ref('')
const errorMsg = ref('')
const hasError = ref(false)
const timeStr = ref('')
const dateStr = ref('')
const aiAvatar = ref('💬')
const aiAvatarUrl = ref('')
const FALLBACK = '0000'

const greeting = computed(() => {
    const h = new Date().getHours()
    if (h < 5) return '深夜了，慢来'
    if (h < 9) return '早上好'
    if (h < 12) return '上午好'
    if (h < 14) return '中午好'
    if (h < 18) return '下午好'
    if (h < 22) return '晚上好'
    return '夜深了'
})

function updateTime() {
    const now = new Date()
    const h = String(now.getHours()).padStart(2, '0')
    const m = String(now.getMinutes()).padStart(2, '0')
    timeStr.value = `${h}:${m}`
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    dateStr.value = `${now.getMonth() + 1}月${now.getDate()}日 ${weekdays[now.getDay()]}`
}

let timer = null

function onKey(n) {
    if (n === '') return
    if (n === '⌫') {
        pin.value = pin.value.slice(0, -1)
        errorMsg.value = ''
        hasError.value = false
        return
    }
    if (pin.value.length >= 4) return
    pin.value += String(n)
    if (pin.value.length === 4) {
        const stored = localStorage.getItem('lock_pin') || FALLBACK
        if (pin.value === stored || pin.value === FALLBACK) {
            if (pin.value === FALLBACK && stored !== FALLBACK) {
                localStorage.removeItem('lock_pin')
                localStorage.setItem('lock_enabled', 'false')
            }
            unlock()
        } else {
            hasError.value = true
            errorMsg.value = '密码错误，请重试'
            setTimeout(() => {
                pin.value = ''
                hasError.value = false
                errorMsg.value = ''
            }, 600)
        }
    }
}

function unlock() {
    visible.value = false
    pin.value = ''
}

onMounted(() => {
    const cachedAi = sessionStorage.getItem('cached_current_ai')
    if (cachedAi) {
        try {
            const ai = JSON.parse(cachedAi)
            aiAvatarUrl.value = ai.avatarUrl || ''
            aiAvatar.value = ai.avatar || '💬'
        } catch { }
    }
    updateTime()
    timer = setInterval(updateTime, 10000)
    const enabled = localStorage.getItem('lock_enabled') === 'true'
    if (enabled) visible.value = true
})

onUnmounted(() => clearInterval(timer))
</script>

<style scoped>
.lockscreen {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    align-items: center;
    overflow: hidden;
    padding-top: env(safe-area-inset-top, 44px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: linear-gradient(180deg, #FFF5F7 0%, #FFEEF2 50%, #FFE6EC 100%);
}

.lock-blob {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
    filter: blur(70px);
}

.lb-tl {
    top: -60px;
    left: -60px;
    width: 300px;
    height: 300px;
    background: #F1DADD;
    opacity: 0.6;
}

.lb-br {
    bottom: 20px;
    right: -70px;
    width: 260px;
    height: 260px;
    background: #D8CDEA;
    opacity: 0.35;
}

.lb-mid {
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 240px;
    height: 240px;
    background: #98CBEA;
    opacity: 0.12;
}

/* 时间 */
.lock-top {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 36px;
    flex: 1;
    position: relative;
    z-index: 1;
}

.lock-time {
    font-size: 80px;
    font-weight: 200;
    color: #3A2F35;
    letter-spacing: -3px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
}

.lock-date {
    font-size: 13px;
    color: #B8A9AC;
    margin-top: 8px;
    font-weight: 400;
    letter-spacing: 0.3px;
}

.lock-persona {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    margin-top: 32px;
}

.lock-avatar {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 2px solid rgba(255, 255, 255, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    box-shadow: 0 8px 28px rgba(217, 163, 175, 0.25), 0 0 0 1px rgba(255, 240, 242, 0.5) inset;
}

.lock-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.lock-avatar span {
    font-size: 28px;
}

.lock-greeting {
    font-size: 15px;
    color: #6B5B5E;
    font-weight: 500;
    letter-spacing: 0.2px;
}

/* 密码点 */
.lock-pin-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    position: relative;
    z-index: 1;
    margin-bottom: 16px;
}

.lock-pin-label {
    font-size: 13px;
    color: #B8A9AC;
    height: 18px;
    transition: color 0.2s;
}

.lock-pin-label.has-error {
    color: #C07070;
}

.lock-dots {
    display: flex;
    gap: 20px;
}

.lock-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid rgba(217, 163, 175, 0.4);
    background: transparent;
    transition: all 0.18s ease;
    box-shadow: 0 2px 6px rgba(217, 163, 175, 0.08);
}

.lock-dot.filled {
    background: linear-gradient(135deg, #F4B8CC, #D9A3AF);
    border-color: transparent;
    box-shadow: 0 3px 10px rgba(217, 163, 175, 0.45);
    transform: scale(1.1);
}

.lock-dot.error {
    background: rgba(192, 112, 112, 0.5);
    border-color: transparent;
    animation: shake 0.4s ease;
}

@keyframes shake {
    0%, 100% { transform: translateX(0); }
    20% { transform: translateX(-5px); }
    40% { transform: translateX(5px); }
    60% { transform: translateX(-3px); }
    80% { transform: translateX(3px); }
}

/* 键盘 */
.lock-keyboard {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    width: 100%;
    max-width: 310px;
    padding: 0 20px;
    position: relative;
    z-index: 1;
    margin-bottom: 8px;
}

.lock-key {
    height: 72px;
    border-radius: 22px;
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: saturate(180%) blur(20px);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    border: 1px solid rgba(255, 240, 242, 0.7);
    cursor: pointer;
    font-family: inherit;
    transition: all 0.12s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 16px rgba(217, 163, 175, 0.1), 0 1px 0 rgba(255, 255, 255, 0.8) inset;
}

.lock-key:active {
    transform: scale(0.91);
    background: rgba(232, 192, 201, 0.25);
    box-shadow: 0 2px 8px rgba(217, 163, 175, 0.2);
}

.lock-key-num {
    font-size: 26px;
    font-weight: 300;
    color: #4A3F41;
}

.lock-key-del .lock-key-num {
    font-size: 20px;
    color: #B8A9AC;
}

.lock-key-empty {
    background: transparent !important;
    border-color: transparent !important;
    box-shadow: none !important;
    pointer-events: none;
}

.lock-bottom-spacer {
    height: 20px;
}

.lock-fade-enter-active {
    transition: opacity 0.28s ease;
}

.lock-fade-leave-active {
    transition: opacity 0.3s ease;
}

.lock-fade-enter-from,
.lock-fade-leave-to {
    opacity: 0;
}
</style>
