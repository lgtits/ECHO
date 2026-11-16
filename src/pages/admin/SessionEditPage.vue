<script setup lang="ts">
// A3 建立／編輯場次（ux.md A3；AC5.2、AC5.9）。
// 手機全螢幕；平板、筆電右側滑出面板（寬 480px），背後的頁面仍看得到。
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import { useSessionsStore } from '@/stores/sessions';
import { useBoardStore } from '@/stores/board';
import { LIMITS } from '@/types/models';
import { errorMessage } from '@/utils/errors';
import { formatHm, nextSunday, parseDate } from '@/utils/time';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const sessions = useSessionsStore();
const board = useBoardStore();

const editId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null));
const isEdit = computed(() => !!editId.value);

const open = ref(true);
const loading = ref(isEdit.value);
const saving = ref<'open' | 'draft' | 'save' | null>(null);
const error = ref('');
const touched = ref(false);

const title = ref('');
const sermonDate = ref(nextSunday());
const speaker = ref('');
const scripture = ref('');
const autoCloseTime = ref(''); // HH:mm，空白 = 不自動結束
const speakers = ref<string[]>([]);

/** 15 分鐘為單位（ux.md A3） */
const timeOptions = Array.from({ length: 96 }, (_, i) => {
  const h = String(Math.floor(i / 4)).padStart(2, '0');
  const m = String((i % 4) * 15).padStart(2, '0');
  return `${h}:${m}`;
});

const titleError = computed(() => {
  if (!touched.value) return '';
  if (!title.value.trim()) return '請輸入標題';
  if (title.value.length > LIMITS.sessionTitle) return `標題最多 ${LIMITS.sessionTitle} 字`;
  return '';
});
const valid = computed(
  () => !!title.value.trim() && title.value.length <= LIMITS.sessionTitle && !!sermonDate.value,
);

function autoCloseIso(): string | null {
  if (!autoCloseTime.value) return null;
  const d = parseDate(sermonDate.value);
  const [h, m] = autoCloseTime.value.split(':').map(Number);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

function input() {
  return {
    title: title.value.trim(),
    sermonDate: sermonDate.value,
    speaker: speaker.value.trim() || null,
    scripture: scripture.value.trim() || null,
    autoCloseAt: autoCloseIso(),
  };
}

const parentPath = computed(() => (isEdit.value ? `/admin/sessions/${editId.value}` : '/admin'));

function onHide() {
  if (!saving.value) void router.push(parentPath.value);
}

async function submit(kind: 'open' | 'draft' | 'save') {
  touched.value = true;
  if (!valid.value || saving.value) return;
  saving.value = kind;
  error.value = '';
  try {
    if (kind === 'save' && editId.value) {
      const s = await sessions.update(editId.value, input());
      if (board.session?.id === s.id) board.setSession(s);
      $q.notify({ message: '已儲存' });
      await router.push(`/admin/sessions/${s.id}`);
    } else {
      const s = await sessions.create(input(), kind === 'open' ? 'open' : 'draft');
      // 建立後直接進入場次頁，最上方先顯示 QR（AC5.2）
      await router.push({ path: `/admin/sessions/${s.id}`, query: { created: '1' } });
    }
  } catch (e) {
    error.value = errorMessage(e);
    saving.value = null;
  }
}

onMounted(async () => {
  speakers.value = await sessions.recentSpeakers();
  if (editId.value) {
    const s = await sessions.getById(editId.value);
    if (s) {
      title.value = s.title;
      sermonDate.value = s.sermonDate;
      speaker.value = s.speaker ?? '';
      scripture.value = s.scripture ?? '';
      autoCloseTime.value = s.autoCloseAt ? formatHm(new Date(s.autoCloseAt)) : '';
    }
    loading.value = false;
  } else {
    speaker.value = speakers.value[0] ?? ''; // 預設上一場的講員
  }
});
</script>

<template>
  <q-dialog
    v-model="open"
    :position="$q.screen.lt.sm ? 'standard' : 'right'"
    :maximized="$q.screen.lt.sm"
    full-height
    @hide="onHide"
  >
    <!-- Quasar 只讓 q-dialog 的直接子層 div 接收點擊，所以外面要包 div -->
    <div class="edit-shell">
      <form
        class="edit"
        :aria-label="isEdit ? '編輯場次資訊' : '新增場次'"
        @submit.prevent="submit(isEdit ? 'save' : 'open')"
      >
        <header class="edit__head">
          <h2 class="edit__title">{{ isEdit ? '編輯場次資訊' : '新增場次' }}</h2>
          <button type="button" class="btn btn--text btn--muted" @click="open = false">取消</button>
        </header>

        <div v-if="loading" class="edit__body">
          <q-skeleton v-for="i in 4" :key="i" type="rect" height="72px" />
        </div>

        <div v-else class="edit__body">
          <div class="field">
            <label for="f-title" class="field__label">標題（必填）</label>
            <input
              id="f-title"
              v-model="title"
              class="input"
              :class="{ 'input--invalid': titleError }"
              :maxlength="LIMITS.sessionTitle + 10"
              @blur="touched = true"
            />
            <span v-if="titleError" class="field__error">{{ titleError }}</span>
          </div>

          <div class="field">
            <label for="f-date" class="field__label">日期（必填）</label>
            <input id="f-date" v-model="sermonDate" class="input" type="date" required />
            <span v-if="!isEdit" class="field__hint">預設為下一個主日</span>
          </div>

          <div class="field">
            <label for="f-speaker" class="field__label">講員／主講人</label>
            <input
              id="f-speaker"
              v-model="speaker"
              class="input"
              list="speaker-options"
              autocomplete="off"
            />
            <datalist id="speaker-options">
              <option v-for="sp in speakers" :key="sp" :value="sp" />
            </datalist>
          </div>

          <div class="field">
            <label for="f-scripture" class="field__label">經文／副標題</label>
            <input
              id="f-scripture"
              v-model="scripture"
              class="input"
              placeholder="例：羅馬書 5:1–11"
            />
          </div>

          <div class="field">
            <label for="f-close" class="field__label">自動結束時間</label>
            <div class="edit__row">
              <select id="f-close" v-model="autoCloseTime" class="input">
                <option value="">不自動結束</option>
                <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
              </select>
              <button
                v-if="autoCloseTime"
                type="button"
                class="btn btn--text btn--muted"
                @click="autoCloseTime = ''"
              >
                清除
              </button>
            </div>
            <span class="field__hint">到時間後自動結束留言，日期與場次日期相同；可以不設。</span>
          </div>

          <p v-if="error" class="field__error" role="alert">{{ error }}</p>
        </div>

        <footer class="edit__foot">
          <template v-if="isEdit">
            <button
              type="submit"
              class="btn btn--primary btn--block btn--lg"
              :disabled="!!saving || loading"
            >
              <q-spinner v-if="saving" size="18px" />
              儲存
            </button>
          </template>
          <template v-else>
            <button type="submit" class="btn btn--primary btn--block btn--lg" :disabled="!!saving">
              <q-spinner v-if="saving === 'open'" size="18px" />
              建立並開放留言
            </button>
            <button
              type="button"
              class="btn btn--secondary btn--block btn--lg"
              :disabled="!!saving"
              @click="submit('draft')"
            >
              <q-spinner v-if="saving === 'draft'" size="18px" />
              先存成草稿
            </button>
          </template>
        </footer>
      </form>
    </div>
  </q-dialog>
</template>

<style scoped lang="scss">
.edit-shell {
  height: 100%;
}

.edit {
  display: flex;
  flex-direction: column;
  width: 480px;
  max-width: 100vw;
  height: 100%;
  background: var(--echo-bg);

  &__head {
    display: flex;
    align-items: center;
    gap: 12px;
    height: 60px;
    padding: 0 8px 0 24px;
    border-bottom: 1px solid var(--echo-line);
  }

  &__title {
    flex: 1;
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }

  &__body {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 24px;
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 8px;

    .input {
      flex: 1;
    }
  }

  &__foot {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 24px calc(16px + env(safe-area-inset-bottom));
    border-top: 1px solid var(--echo-line);
  }
}
</style>
