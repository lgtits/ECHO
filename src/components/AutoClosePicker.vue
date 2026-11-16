<script setup lang="ts">
// 自動結束時間（spec AC5.9；ux.md A3）：日期＋時間（15 分鐘為單位），可清除。
// 場次表單與場次頁的「設定自動結束」共用。v-model 是 ISO 字串，null = 不自動結束。
import { computed, ref, watch } from 'vue';
import { formatHm, parseDate, toYmd } from '@/utils/time';
import { useClock } from '@/composables/useClock';

const model = defineModel<string | null>({ required: true });
const props = defineProps<{
  /** 還沒選日期時預設用這天（通常是場次日期） */
  defaultDate: string;
  idPrefix?: string;
  /** 是否提示「時間已過」（編輯時沒改動的舊值不提示） */
  checkPast?: boolean;
}>();

const clock = useClock();
const id = (k: string) => `${props.idPrefix ?? 'ac'}-${k}`;

const date = ref('');
const time = ref('');

function syncFromModel(v: string | null) {
  if (!v) {
    time.value = '';
    return;
  }
  const d = new Date(v);
  date.value = toYmd(d);
  time.value = formatHm(d);
}
syncFromModel(model.value);

/** 15 分鐘為單位；既有值不在格線上時也列出來 */
const timeOptions = computed(() => {
  const list = Array.from({ length: 96 }, (_, i) => {
    const h = String(Math.floor(i / 4)).padStart(2, '0');
    const m = String((i % 4) * 15).padStart(2, '0');
    return `${h}:${m}`;
  });
  if (time.value && !list.includes(time.value)) {
    list.push(time.value);
    list.sort();
  }
  return list;
});

function toIso(): string | null {
  if (!time.value || !date.value) return null;
  const d = parseDate(date.value);
  const [h, m] = time.value.split(':').map(Number);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.toISOString();
}

watch([date, time], () => {
  if (time.value && !date.value) date.value = props.defaultDate;
  const iso = toIso();
  if (iso !== model.value) model.value = iso;
});

watch(model, (v) => {
  if (v !== toIso()) syncFromModel(v);
});

// 場次日期改了：還沒特別改過自動結束日期的話跟著走
watch(
  () => props.defaultDate,
  (next, prev) => {
    if (!date.value || date.value === prev) date.value = next;
  },
);

const isPast = computed(
  () =>
    props.checkPast !== false && !!model.value && new Date(model.value).getTime() <= clock.value,
);

function clear() {
  time.value = '';
}

defineExpose({ isPast });
</script>

<template>
  <div class="field">
    <span :id="id('label')" class="field__label">自動結束時間</span>
    <div class="ac" role="group" :aria-labelledby="id('label')">
      <input
        :id="id('date')"
        v-model="date"
        class="input ac__date"
        type="date"
        aria-label="自動結束日期"
        :disabled="!time"
      />
      <select :id="id('time')" v-model="time" class="input ac__time" aria-label="自動結束時間">
        <option value="">不自動結束</option>
        <option v-for="t in timeOptions" :key="t" :value="t">{{ t }}</option>
      </select>
      <button v-if="time" type="button" class="btn btn--text btn--muted" @click="clear">
        清除
      </button>
    </div>
    <span v-if="isPast" class="field__error" role="alert">這個時間已經過了，請改成之後的時間</span>
    <span v-else class="field__hint">先選時間，日期預設為場次日期，可以改成其他天；可以不設。</span>
  </div>
</template>

<style scoped lang="scss">
.ac {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;

  &__date {
    flex: 1 1 160px;
    width: auto;
  }

  &__time {
    flex: 1 1 140px;
    width: auto;
  }

  &__date:disabled {
    color: var(--echo-faint);
    background: var(--echo-subtle);
  }
}
</style>
