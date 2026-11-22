<script setup lang="ts">
// A3 建立／編輯場次（ux.md A3；AC5.2、AC5.9）。
// 手機全螢幕；平板、筆電置中對話框（寬 520px），背後的頁面仍看得到。
import { computed, onMounted, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useRoute, useRouter } from 'vue-router';
import { useSessionsStore } from '@/stores/sessions';
import { useBoardStore } from '@/stores/board';
import { LIMITS } from '@/types/models';
import { errorMessage } from '@/utils/errors';
import { nextSunday } from '@/utils/time';
import AutoClosePicker from '@/components/AutoClosePicker.vue';

const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const sessions = useSessionsStore();
const board = useBoardStore();

const editId = computed(() => (typeof route.params.id === 'string' ? route.params.id : null));
const isEdit = computed(() => !!editId.value);
/** 「先存成草稿」暫時不開放（spec D17）；要恢復時改成 true */
const SHOW_DRAFT = false;

const open = ref(true);
const loading = ref(isEdit.value);
const saving = ref<'open' | 'draft' | 'save' | null>(null);
const error = ref('');
const touched = ref(false);

const title = ref('');
const sermonDate = ref(nextSunday());
const speaker = ref('');
const scripture = ref('');
const autoCloseAt = ref<string | null>(null); // ISO，null = 不自動結束
const initialAutoClose = ref<string | null>(null);
/** 只在改了自動結束時間時才檢查「已經過了」，避免擋住已結束場次的其他修改 */
const autoCloseChanged = computed(() => autoCloseAt.value !== initialAutoClose.value);
const autoClosePast = computed(
  () =>
    autoCloseChanged.value &&
    !!autoCloseAt.value &&
    new Date(autoCloseAt.value).getTime() <= Date.now(),
);
const speakers = ref<string[]>([]);

const titleError = computed(() => {
  if (!touched.value) return '';
  if (!title.value.trim()) return '請輸入標題';
  if (title.value.length > LIMITS.sessionTitle) return `標題最多 ${LIMITS.sessionTitle} 字`;
  return '';
});
/** 講員必填、預設空白（2026-11-22，ux.md A3） */
const speakerTouched = ref(false);
const speakerError = computed(() =>
  (touched.value || speakerTouched.value) && !speaker.value.trim() ? '請輸入講員／主講人' : '',
);
const valid = computed(
  () =>
    !!title.value.trim() &&
    title.value.length <= LIMITS.sessionTitle &&
    !!sermonDate.value &&
    !!speaker.value.trim(),
);

function input() {
  return {
    title: title.value.trim(),
    sermonDate: sermonDate.value,
    speaker: speaker.value.trim() || null,
    scripture: scripture.value.trim() || null,
    autoCloseAt: autoCloseAt.value,
  };
}

const parentPath = computed(() => (isEdit.value ? `/admin/sessions/${editId.value}` : '/admin'));

function onHide() {
  if (!saving.value) void router.push(parentPath.value);
}

async function submit(kind: 'open' | 'draft' | 'save') {
  touched.value = true;
  if (!valid.value || saving.value) return;
  if (autoClosePast.value) return;
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
      autoCloseAt.value = s.autoCloseAt;
      initialAutoClose.value = s.autoCloseAt;
    }
    loading.value = false;
  }
});
</script>

<template>
  <!-- 手機：全螢幕；平板、電腦：畫面正中央的對話框（ux.md A3，2026-11-22） -->
  <q-dialog v-model="open" :maximized="$q.screen.lt.sm" @hide="onHide">
    <!-- Quasar 只讓 q-dialog 的直接子層 div 接收點擊，所以外面要包 div -->
    <div class="edit-shell" :class="{ 'edit-shell--full': $q.screen.lt.sm }">
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
            <label for="f-speaker" class="field__label">講員／主講人（必填）</label>
            <input
              id="f-speaker"
              v-model="speaker"
              class="input"
              :class="{ 'input--invalid': speakerError }"
              list="speaker-options"
              autocomplete="off"
              @blur="speakerTouched = true"
            />
            <span v-if="speakerError" class="field__error">{{ speakerError }}</span>
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

          <AutoClosePicker
            v-model="autoCloseAt"
            :default-date="sermonDate"
            :check-past="autoCloseChanged"
            id-prefix="f-close"
          />

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
              v-if="SHOW_DRAFT"
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
  display: flex;
  max-height: calc(100vh - 48px);

  // 手機全螢幕
  &--full {
    height: 100%;
    max-height: none;

    .edit {
      width: 100vw;
      height: 100%;
      max-height: none;
      border-radius: 0;
    }
  }
}

.edit {
  display: flex;
  flex-direction: column;
  width: 520px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 48px);
  overflow: hidden;
  border-radius: var(--echo-radius-lg);
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
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 24px;
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
