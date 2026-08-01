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
            <span class="settings-title">钱包</span>
            <div class="view-switch">
                <button :class="['vs-btn', walletView === 'user' ? 'active' : '']"
                    @click="switchView('user')">我</button>
                <button :class="['vs-btn', walletView === 'char' ? 'active' : '']"
                    @click="switchView('char')">TA</button>
            </div>
        </div>

        <!-- 角色切换，加在 settings-nav 和 sub-content 之间 -->
        <div v-if="walletView === 'char'" class="persona-scroll">
            <div v-for="p in personas" :key="p.id" class="persona-chip" :class="{ active: currentPersona === p.id }"
                @click="switchPersona(p.id)">
                <div class="persona-chip-avatar">
                    <img v-if="p.avatarUrl" :src="p.avatarUrl" />
                    <span v-else>{{ p.avatar || '💬' }}</span>
                </div>
                <span>{{ p.note || p.name }}</span>
            </div>
        </div>

        <div class="sub-content">

            <!-- 余额卡片 -->
            <div class="wallet-hero">
                <div class="wallet-hero-bg"></div>
                <div class="wallet-balance-label">总余额</div>
                <div class="wallet-balance">
                    <span class="balance-currency">¥</span>
                    <span class="balance-amount">{{ balance.toFixed(2) }}</span>
                </div>
                <div class="wallet-hero-btns">
                    <button class="wallet-btn" @click="showTransferIn = true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round">
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                            <path d="M5 21h14" />
                        </svg>
                        收款
                    </button>
                    <button class="wallet-btn" @click="showTransferOut = true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round">
                            <polyline points="7 16 12 21 17 16" />
                            <line x1="12" y1="21" x2="12" y2="9" />
                            <path d="M5 3h14" />
                        </svg>
                        转出
                    </button>
                </div>
            </div>

            <!-- 礼物收藏 -->
            <div class="section-label-sm">礼物记录</div>
            <div v-if="gifts.length === 0" class="wallet-empty">
                <svg viewBox="0 0 24 24" fill="none" stroke="#D4C8CA" stroke-width="1.2" stroke-linecap="round">
                    <path d="M20 12v10H4V12" />
                    <path d="M22 7H2v5h20V7z" />
                    <path d="M12 22V7" />
                    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
                    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                </svg>
                <p>还没有收到礼物</p>
                <p>和 char 聊天时，他可能会送你惊喜</p>
            </div>
            <div v-else class="gift-list">
                <div v-for="(gift, idx) in gifts" :key="idx" class="gift-item">
                    <div class="gift-icon">{{ gift.emoji }}</div>
                    <div class="gift-info">
                        <div class="gift-name">{{ gift.name }}</div>
                        <div v-if="gift.content" class="gift-content-text">内含：{{ gift.content }}</div>
                        <div class="gift-from">
                            {{ gift.direction === 'ai_to_user' ? `${gift.from} → 我` : `我 → ${gift.to}` }}
                            · {{ gift.date }}
                        </div>
                    </div>
                    <div v-if="gift.message" class="gift-note">「{{ gift.message }}」</div>
                </div>
            </div>

            <!-- 交易记录 -->
            <div class="section-label-sm">交易记录</div>
            <div v-if="transactions.length === 0" class="wallet-empty small">
                暂无交易记录
            </div>
            <div v-else class="settings-group">
                <div v-for="(tx, idx) in transactions" :key="idx" class="settings-group-item">
                    <div class="tx-icon" :class="tx.type === 'in' ? 'tx-in' : 'tx-out'">
                        <svg v-if="tx.type === 'in'" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                            stroke-width="2" stroke-linecap="round">
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                            stroke-linecap="round">
                            <polyline points="7 16 12 21 17 16" />
                            <line x1="12" y1="21" x2="12" y2="9" />
                        </svg>
                    </div>
                    <div class="sgi-label-wrap">
                        <div class="sgi-label">
                            {{ getCategoryEmoji(tx.category) }} {{ tx.categoryLabel }}
                            <span v-if="tx.desc" style="color:#B8A9AC;font-weight:400;font-size:12px;"> · {{ tx.desc
                            }}</span>
                        </div>
                        <div class="sgi-desc">
                            {{ tx.type === 'in'
                                ? (tx.from ? tx.from + ' → 我' : '收入')
                                : ('我' + (tx.to ? ' → ' + tx.to : ''))
                            }}
                            · {{ tx.date }}
                        </div>
                    </div>
                    <div class="tx-amount" :class="tx.type === 'in' ? 'amount-in' : 'amount-out'">
                        {{ tx.type === 'in' ? '+' : '-' }}¥{{ tx.amount.toFixed(2) }}
                    </div>
                    <button class="tx-edit-btn" @click="startEditTx(tx, idx)">编辑</button>
                </div>
            </div>

            <!-- 编辑交易记录弹窗 -->
            <div v-if="showEditTx" class="pin-modal-overlay" @click.self="showEditTx = false">
                <div class="transfer-modal">
                    <div class="transfer-modal-title">编辑记录</div>
                    <div class="transfer-input-wrap">
                        <span class="transfer-currency">¥</span>
                        <input class="transfer-input" v-model.number="editTxAmount" type="number" placeholder="0.00" />
                    </div>
                    <div class="transfer-category-row">
                        <div v-for="cat in (editTxType === 'in' ? inCategories : outCategories)" :key="cat.key"
                            class="transfer-cat-chip" :class="{ active: editTxCategory === cat.key }"
                            @click="editTxCategory = cat.key">
                            {{ cat.emoji }} {{ cat.label }}
                        </div>
                    </div>
                    <input class="transfer-desc-input" v-model="editTxDesc" placeholder="备注（可选）" />
                    <input class="transfer-desc-input" v-model="editTxFrom"
                        :placeholder="editTxType === 'in' ? '来自（可选）' : '转给（可选）'" style="margin-top:0;" />
                    <div class="transfer-btns">
                        <button class="transfer-btn-delete" @click="deleteEditTx">删除</button>
                        <button class="transfer-btn-cancel" @click="showEditTx = false">取消</button>
                        <button class="transfer-btn-confirm" @click="saveEditTx">保存</button>
                    </div>

                </div>
            </div>

        </div>

        <!-- 收款弹窗 -->
        <div v-if="showTransferIn" class="pin-modal-overlay" @click.self="showTransferIn = false">
            <div class="transfer-modal">
                <div class="transfer-modal-title">记一笔收入</div>
                <div class="transfer-input-wrap">
                    <span class="transfer-currency">¥</span>
                    <input class="transfer-input" v-model="transferAmount" type="number" placeholder="0.00" />
                </div>
                <div class="transfer-category-row">
                    <div v-for="cat in inCategories" :key="cat.key" class="transfer-cat-chip"
                        :class="{ active: transferCategory === cat.key }" @click="transferCategory = cat.key">
                        {{ cat.emoji }} {{ cat.label }}
                    </div>
                </div>
                <input class="transfer-desc-input" v-model="transferDesc" placeholder="备注（可选）" />
                <input class="transfer-desc-input" v-model="transferFrom" placeholder="来自（可选，如：小柔）"
                    style="margin-top:0;" />
                <div class="transfer-btns">
                    <button class="transfer-btn-cancel" @click="showTransferIn = false">取消</button>
                    <button class="transfer-btn-confirm" @click="doTransferIn">确认收入</button>
                </div>
            </div>
        </div>

        <!-- 转出弹窗 -->
        <div v-if="showTransferOut" class="pin-modal-overlay" @click.self="showTransferOut = false">
            <div class="transfer-modal">
                <div class="transfer-modal-title">记一笔支出</div>
                <div class="transfer-input-wrap">
                    <span class="transfer-currency">¥</span>
                    <input class="transfer-input" v-model="transferAmount" type="number" placeholder="0.00" />
                </div>
                <div class="transfer-category-row">
                    <div v-for="cat in outCategories" :key="cat.key" class="transfer-cat-chip"
                        :class="{ active: transferCategory === cat.key }" @click="transferCategory = cat.key">
                        {{ cat.emoji }} {{ cat.label }}
                    </div>
                </div>
                <input class="transfer-desc-input" v-model="transferDesc" placeholder="备注（可选）" />
                <input class="transfer-desc-input" v-model="transferTo" placeholder="转给（可选，如：小柔）"
                    style="margin-top:0;" />
                <div class="transfer-btns">
                    <button class="transfer-btn-cancel" @click="showTransferOut = false">取消</button>
                    <button class="transfer-btn-confirm" @click="doTransferOut">确认支出</button>
                </div>
            </div>
        </div>

    </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { api } from '@/utils/api'

// user 自己的钱包存在 wallet_user 这个 key
const USER_WALLET_ID = 'user'

const balance = ref(0)
const gifts = ref([])
const transactions = ref([])
const showTransferIn = ref(false)
const showTransferOut = ref(false)
const showEditTx = ref(false)
const editTxIdx = ref(-1)
const editTxAmount = ref(0)
const editTxDesc = ref('')
const editTxFrom = ref('')
const editTxType = ref('in')
const editTxCategory = ref('manual')
const transferAmount = ref('')
const transferDesc = ref('')
const personas = ref([])
const currentPersona = ref('')
const transferCategory = ref('manual')
const transferFrom = ref('')
const transferTo = ref('')

const inCategories = [
    { key: 'manual', emoji: '💰', label: '手动' },
    { key: 'gift', emoji: '🎁', label: '礼物' },
    { key: 'transfer', emoji: '💸', label: '转账' },
    { key: 'salary', emoji: '💼', label: '工资' },
    { key: 'other', emoji: '✨', label: '其他' },
]

const outCategories = [
    { key: 'manual', emoji: '💰', label: '手动' },
    { key: 'food', emoji: '🛵', label: '外卖' },
    { key: 'transfer', emoji: '💸', label: '转账' },
    { key: 'gift', emoji: '🎁', label: '礼物' },
    { key: 'express', emoji: '📦', label: '快递' },
    { key: 'other', emoji: '✨', label: '其他' },
]

function getCategoryEmoji(category) {
    const map = { manual: '💰', gift: '🎁', transfer: '💸', food: '🛵', express: '📦', salary: '💼', other: '✨' }
    return map[category] || '💰'
}

// 新增：视角切换
const walletView = ref('user') // 'user' | 'char'

const currentPersonaName = computed(() => {
    const p = personas.value.find(p => p.id === currentPersona.value)
    return p ? (p.note || p.name) : 'TA'
})

const currentWalletId = computed(() => {
    return walletView.value === 'user' ? USER_WALLET_ID : currentPersona.value
})

async function loadPersonas() {
    try {
        const res = await api('/api/personas/all')
        personas.value = await res.json()
        const pinnedList = JSON.parse(localStorage.getItem('pinned_personas') || '[]')
        personas.value.sort((a, b) => {
            if (pinnedList.includes(a.id) && !pinnedList.includes(b.id)) return -1
            if (!pinnedList.includes(a.id) && pinnedList.includes(b.id)) return 1
            return 0
        })
        try {
            const latestRes = await api('/api/messages/latest-persona')
            const latestData = await latestRes.json()
            currentPersona.value = latestData.personaId || personas.value[0]?.id || ''
        } catch {
            currentPersona.value = personas.value[0]?.id || ''
        }
        await load()
    } catch { }
}

async function load() {
    const wid = currentWalletId.value
    if (!wid) return
    try {
        const res = await api(`/api/wallet/${wid}`)
        const data = await res.json()
        balance.value = data.balance || 0
        gifts.value = (data.gifts || []).map(g => ({
            emoji: '🎁',
            name: g.gift_name,
            content: g.gift_content,
            message: g.gift_message,
            direction: g.direction,
            from: g.direction === 'ai_to_user' ? currentPersonaName.value : '我',
            to: g.direction === 'ai_to_user' ? '我' : currentPersonaName.value,
            date: g.created_at?.slice(0, 10),
        }))
        transactions.value = (data.transfers || []).map(t => ({
            type: t.direction === 'ai_to_user' ? 'in' : 'out',
            amount: t.amount,
            category: t.category || 'manual',
            categoryLabel: getCategoryLabel(t.category, t.direction), // 🚀 分类标签单独存
            desc: t.note || '',  // 🚀 备注就是备注，不用分类标签填充
            from: t.from_name !== undefined && t.from_name !== null ? t.from_name : (t.direction === 'ai_to_user' ? '' : '我'),
            to: t.to_name !== undefined && t.to_name !== null ? t.to_name : (t.direction === 'ai_to_user' ? '我' : ''),
            date: t.created_at?.slice(0, 10),
        }))

    } catch { }
}

function getCategoryLabel(category, direction) {
    const map = { manual: '手动记账', gift: '礼物', transfer: '转账', food: '外卖', express: '快递', salary: '工资', other: '其他' }
    return map[category] || (direction === 'ai_to_user' ? '收入' : '支出')
}

async function doTransferIn() {
    const amount = parseFloat(transferAmount.value)
    if (!amount || amount <= 0) return
    try {
        await api(`/api/wallet/${currentWalletId.value}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                direction: 'ai_to_user',
                amount,
                note: transferDesc.value || '',
                category: transferCategory.value,
                from_name: transferFrom.value,  // 不设默认值，用户填什么就是什么
                to_name: '我'

            })
        })
        await load()
    } catch { }
    transferAmount.value = ''
    transferDesc.value = ''
    transferFrom.value = ''
    transferCategory.value = 'manual'
    showTransferIn.value = false
}

async function doTransferOut() {
    const amount = parseFloat(transferAmount.value)
    if (!amount || amount <= 0) return
    if (amount > balance.value) { alert('余额不足'); return }
    try {
        await api(`/api/wallet/${currentWalletId.value}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                direction: 'user_to_ai',
                amount,
                note: transferDesc.value || '',
                category: transferCategory.value,
                from_name: '我',
                to_name: transferTo.value  // 同上
            })
        })
        await load()
    } catch { }
    transferAmount.value = ''
    transferDesc.value = ''
    transferTo.value = ''
    transferCategory.value = 'manual'
    showTransferOut.value = false
}

function switchPersona(id) {
    currentPersona.value = id
    load()
}

function switchView(view) {
    walletView.value = view
    if (view === 'char' && !currentPersona.value && personas.value.length > 0) {
        currentPersona.value = personas.value[0].id
    }
    load()
}

function startEditTx(tx, idx) {
    editTxIdx.value = idx
    editTxAmount.value = tx.amount
    editTxDesc.value = tx.desc || ''
    editTxFrom.value = tx.type === 'in' ? tx.from : tx.to
    editTxType.value = tx.type
    editTxCategory.value = tx.category || 'manual'
    showEditTx.value = true
}

async function saveEditTx() {
    const wid = currentWalletId.value
    const data = JSON.parse(localStorage.getItem(`wallet_${wid}`) || '{"balance":0,"transfers":[],"gifts":[]}')
    const rawIdx = editTxIdx.value
    if (rawIdx > -1 && data.transfers[rawIdx]) {
        const oldAmount = data.transfers[rawIdx].amount
        const newAmount = parseFloat(editTxAmount.value) || 0
        const direction = data.transfers[rawIdx].direction
        if (direction === 'ai_to_user') {
            data.balance = data.balance - oldAmount + newAmount
        } else {
            data.balance = data.balance + oldAmount - newAmount
        }
        data.transfers[rawIdx].amount = newAmount
        data.transfers[rawIdx].note = editTxDesc.value
        data.transfers[rawIdx].category = editTxCategory.value
        if (direction === 'ai_to_user') {
            data.transfers[rawIdx].from_name = editTxFrom.value
        } else {
            data.transfers[rawIdx].to_name = editTxFrom.value
        }
        localStorage.setItem(`wallet_${wid}`, JSON.stringify(data))
        await load()
    }
    showEditTx.value = false
}

async function deleteEditTx() {
    if (!confirm('确定删除这条记录？')) return
    const wid = currentWalletId.value
    const data = JSON.parse(localStorage.getItem(`wallet_${wid}`) || '{"balance":0,"transfers":[],"gifts":[]}')
    const rawIdx = editTxIdx.value
    if (rawIdx > -1 && data.transfers[rawIdx]) {
        const tx = data.transfers[rawIdx]
        // 还原余额
        if (tx.direction === 'ai_to_user') {
            data.balance = Math.max(0, data.balance - tx.amount)
        } else {
            data.balance = data.balance + tx.amount
        }
        data.transfers.splice(rawIdx, 1)
        localStorage.setItem(`wallet_${wid}`, JSON.stringify(data))
        await load()
    }
    showEditTx.value = false
}

onMounted(loadPersonas)

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

/* 余额卡片 */
.wallet-hero {
    position: relative;
    overflow: hidden;
    background: linear-gradient(135deg, #E8C0C9 0%, #D9A3AF 50%, #C88B98 100%);
    border-radius: 24px;
    padding: 24px 20px 20px;
    margin-top: 12px;
    margin-bottom: 4px;
    box-shadow: 0 12px 32px rgba(217, 163, 175, 0.3);
}

.wallet-hero-bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(circle at 80% 20%, rgba(255, 255, 255, 0.15), transparent 60%);
}

.wallet-balance-label {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    margin-bottom: 6px;
}

.wallet-balance {
    display: flex;
    align-items: baseline;
    gap: 4px;
    margin-bottom: 20px;
}

.balance-currency {
    font-size: 20px;
    color: rgba(255, 255, 255, 0.85);
    font-weight: 600;
}

.balance-amount {
    font-size: 42px;
    font-weight: 800;
    color: white;
    line-height: 1;
    letter-spacing: -1px;
}

.wallet-hero-btns {
    display: flex;
    gap: 10px;
}

.wallet-btn {
    flex: 1;
    height: 40px;
    border-radius: 14px;
    background: rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    transition: background 0.2s;
}

.wallet-btn:active {
    background: rgba(255, 255, 255, 0.3);
}

.wallet-btn svg {
    width: 14px;
    height: 14px;
}

/* 礼物 */
.wallet-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 32px 0;
    color: #D4C8CA;
    font-size: 12px;
    text-align: center;
    line-height: 1.6;
}

.wallet-empty.small {
    padding: 16px 0;
}

.wallet-empty svg {
    width: 36px;
    height: 36px;
    opacity: 0.5;
    margin-bottom: 4px;
}

.gift-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 4px;
}

.gift-item {
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(255, 255, 255, 0.45);
    backdrop-filter: saturate(180%) blur(16px);
    -webkit-backdrop-filter: saturate(180%) blur(16px);
    border-radius: 18px;
    padding: 14px 16px;
    box-shadow: 0 6px 20px rgba(217, 163, 175, 0.08);
    border: 1px solid rgba(255, 240, 242, 0.4);
}

.gift-icon {
    font-size: 28px;
    flex-shrink: 0;
}

.gift-info {
    flex: 1;
}

.gift-name {
    font-size: 14px;
    font-weight: 600;
    color: #4A3F41;
}

.gift-from {
    font-size: 11px;
    color: #B8A9AC;
    margin-top: 2px;
}

.gift-note {
    font-size: 11px;
    color: #D9A3AF;
    font-style: italic;
    flex-shrink: 0;
    max-width: 80px;
    text-align: right;
}

/* 交易记录 */
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

.sgi-label {
    font-size: 14px;
    color: #4A3F41;
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

.tx-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.tx-in {
    background: rgba(107, 175, 122, 0.12);
}

.tx-in svg {
    stroke: #6BAF7A;
    width: 16px;
    height: 16px;
}

.tx-out {
    background: rgba(192, 112, 112, 0.1);
}

.tx-out svg {
    stroke: #C07070;
    width: 16px;
    height: 16px;
}

.tx-amount {
    font-size: 14px;
    font-weight: 700;
    flex-shrink: 0;
}

.amount-in {
    color: #6BAF7A;
}

.amount-out {
    color: #C07070;
}

/* 转账弹窗 */
.pin-modal-overlay {
    position: fixed;
    inset: 0;
    z-index: 300;
    background: rgba(74, 63, 65, 0.25);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    display: flex;
    align-items: flex-end;
    padding: 0 16px 32px;
}

.transfer-modal {
    background: rgba(255, 252, 252, 0.96);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border-radius: 28px;
    padding: 24px 20px;
    width: 100%;
    box-shadow: 0 20px 60px rgba(217, 163, 175, 0.2);
    border: 1px solid rgba(255, 240, 242, 0.5);
    animation: slideUp 0.3s cubic-bezier(0.22, 0.61, 0.36, 1);
}

@keyframes slideUp {
    from {
        transform: translateY(40px);
        opacity: 0;
    }

    to {
        transform: translateY(0);
        opacity: 1;
    }
}

.transfer-modal-title {
    font-size: 17px;
    font-weight: 800;
    color: #4A3F41;
    margin-bottom: 20px;
    text-align: center;
}

.transfer-input-wrap {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(255, 240, 242, 0.6);
    border-radius: 16px;
    padding: 12px 16px;
    margin-bottom: 10px;
}

.transfer-currency {
    font-size: 20px;
    color: #D9A3AF;
    font-weight: 700;
}

.transfer-input {
    flex: 1;
    border: none;
    background: transparent;
    outline: none;
    font-size: 24px;
    font-weight: 700;
    color: #4A3F41;
    font-family: inherit;
}

.transfer-input::placeholder {
    color: #D4C8CA;
}

.transfer-desc-input {
    width: 100%;
    border: 1px solid rgba(255, 240, 242, 0.6);
    background: rgba(255, 255, 255, 0.6);
    border-radius: 14px;
    padding: 12px 16px;
    font-size: 14px;
    color: #4A3F41;
    font-family: inherit;
    outline: none;
    margin-bottom: 16px;
}

.transfer-desc-input::placeholder {
    color: #D4C8CA;
}

.transfer-btns {
    display: flex;
    gap: 8px;
}

.transfer-btn-cancel {
    flex: 1;
    height: 46px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.6);
    border: 1px solid rgba(255, 240, 242, 0.5);
    font-size: 15px;
    color: #6B5B5E;
    cursor: pointer;
    font-family: inherit;
}

.transfer-btn-confirm {
    flex: 1;
    height: 46px;
    border-radius: 16px;
    background: linear-gradient(135deg, #E8C0C9, #D9A3AF);
    border: none;
    font-size: 15px;
    color: white;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    box-shadow: 0 6px 16px rgba(217, 163, 175, 0.3);
}

.persona-scroll {
    display: flex;
    gap: 8px;
    padding: 8px 16px 4px;
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

.gift-content-text {
    font-size: 11px;
    color: #D9A3AF;
    margin-top: 1px;
}

.view-switch {
    display: flex;
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: saturate(180%) blur(12px);
    -webkit-backdrop-filter: saturate(180%) blur(12px);
    border: 1px solid rgba(255, 240, 242, 0.4);
    border-radius: 12px;
    padding: 3px;
    gap: 2px;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(217, 163, 175, 0.08);
}

.vs-btn {
    padding: 5px 14px;
    border-radius: 9px;
    border: none;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    color: #B8A9AC;
    background: transparent;
    transition: all 0.2s;
}

.vs-btn.active {
    background: linear-gradient(135deg, #E8C0C9, #D9A3AF);
    color: white;
    box-shadow: 0 2px 6px rgba(217, 163, 175, 0.25);
}

.tx-edit-btn {
    font-size: 11px;
    color: #D9A3AF;
    background: rgba(217, 163, 175, 0.1);
    border: none;
    border-radius: 8px;
    padding: 4px 10px;
    cursor: pointer;
    font-family: inherit;
    flex-shrink: 0;
}

.transfer-btn-delete {
    flex: 1;
    height: 46px;
    border-radius: 16px;
    background: linear-gradient(135deg, #E8C0C9, #D9A3AF);
    border: none;
    font-size: 15px;
    color: white;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    box-shadow: 0 6px 16px rgba(217, 163, 175, 0.3);
    opacity: 0.85;
}
</style>
