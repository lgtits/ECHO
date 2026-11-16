<script setup lang="ts">
// M1 首頁（ux.md M1；AC1.5、AC1.7、AC8.4）：輸入場次碼、進行中與過去的場次。
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSessionsStore } from '@/stores/sessions';
import type { SessionSummary } from '@/types/models';
import { formatShortDate } from '@/utils/time';
import MemberHeader from '@/components/MemberHeader.vue';

const route = useRoute();
const router = useRouter();
const sessions = useSessionsStore();

const code = ref('');
const checking = ref(false);
const error = ref('');
const loadingMore = ref(false);
const loadError = ref(false);

/** 從 /now 導回來時提示（AC1.7） */
const noCurrent = computed(() => route.query.from === 'now');

const normalized = computed(() => code.value.toUpperCase().replace(/[^0-9A-Z]/g, ''));

async function enter() {
  if (normalized.value.length !== 6 || checking.value) return;
  checking.value = true;
  error.value = '';
  try {
    const s = await sessions.getByCode(normalized.value);
    if (s) await router.push(`/s/${s.code}`);
    else error.value = '找不到此場次，請確認場次碼';
  } catch {
    error.value = '連線中斷，請確認網路後再試';
  } finally {
    checking.value = false;
  }
}

// 自動轉大寫；輸入滿 6 碼自動送出
watch(code, (v) => {
  const n = v
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 6);
  if (n !== v) code.value = n;
  error.value = '';
  if (n.length === 6) void enter();
});

async function load() {
  loadError.value = false;
  try {
    await sessions.loadPublic();
  } catch {
    loadError.value = true;
  }
}

async function more() {
  loadingMore.value = true;
  try {
    await sessions.loadMorePast();
  } finally {
    loadingMore.value = false;
  }
}

const meta = (s: SessionSummary) =>
  [formatShortDate(s.sermonDate), s.speaker, `留言 ${s.postCount}`].filter(Boolean).join(' · ');

onMounted(load);
</script>

<template>
  <MemberHeader />
  <main class="page home">
    <h1 class="home__tagline">主日信息的回應與提問</h1>

    <p v-if="noCurrent" class="home__notice" role="status">目前沒有開放中的場次</p>

    <form class="home__form" @submit.prevent="enter">
      <label for="code" class="field__label">場次碼</label>
      <input
        id="code"
        v-model="code"
        class="input home__code"
        :class="{ 'input--invalid': error }"
        inputmode="text"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        placeholder="例：K7PM2X"
        maxlength="6"
        :aria-invalid="!!error"
        aria-describedby="code-error"
      />
      <p id="code-error" class="field__error home__error" role="alert">{{ error }}</p>
      <button
        type="submit"
        class="btn btn--primary btn--block btn--lg"
        :disabled="normalized.length !== 6 || checking"
      >
        <q-spinner v-if="checking" size="18px" />
        進入
      </button>
    </form>

    <template v-if="!sessions.publicLoaded && !loadError">
      <div class="home__skeleton">
        <q-skeleton v-for="i in 3" :key="i" type="text" height="56px" />
      </div>
    </template>

    <p v-else-if="loadError" class="home__notice">
      無法載入場次列表。
      <button type="button" class="btn btn--text" @click="load">重試</button>
    </p>

    <template v-else>
      <section v-if="sessions.openSessions.length" aria-labelledby="open-title">
        <h2 id="open-title" class="section-label">進行中</h2>
        <hr class="hairline" />
        <router-link
          v-for="s in sessions.openSessions"
          :key="s.id"
          :to="`/s/${s.code}`"
          class="row row--open"
        >
          <span class="row__text">
            <span class="row__title">{{ s.title }}</span>
            <span class="row__meta">{{ meta(s) }}</span>
          </span>
          <span class="row__chev" aria-hidden="true">›</span>
        </router-link>
      </section>

      <section v-if="sessions.pastSessions.length" aria-labelledby="past-title">
        <h2 id="past-title" class="section-label">過去的場次</h2>
        <hr class="hairline" />
        <router-link
          v-for="s in sessions.pastSessions"
          :key="s.id"
          :to="`/s/${s.code}`"
          class="row"
        >
          <span class="row__text">
            <span class="row__title">{{ s.title }}</span>
            <span class="row__meta">{{ meta(s) }}</span>
          </span>
          <span class="row__chev" aria-hidden="true">›</span>
        </router-link>
        <div v-if="sessions.pastHasMore" class="home__more">
          <button
            type="button"
            class="btn btn--text btn--muted"
            :disabled="loadingMore"
            @click="more"
          >
            <q-spinner v-if="loadingMore" size="16px" />
            載入更多
          </button>
        </div>
      </section>
    </template>
  </main>
</template>

<style scoped lang="scss">
.home {
  padding-top: 24px;
  padding-bottom: 40px;

  &__tagline {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    line-height: 1.4;
  }

  &__notice {
    margin: 20px 0 0;
    padding: 12px 14px;
    border-radius: 6px;
    background: var(--echo-subtle);
    font-size: 15px;
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 28px;
  }

  &__code {
    min-height: 60px;
    font-size: 28px;
    font-weight: 600;
    letter-spacing: 0.18em;
    font-variant-numeric: tabular-nums;

    &::placeholder {
      font-size: 18px;
      font-weight: 400;
      letter-spacing: 0.04em;
      color: #a3a39d;
    }
  }

  &__error {
    min-height: 22px;
    margin: 0;
  }

  &__skeleton {
    margin-top: 32px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__more {
    display: flex;
    justify-content: center;
    padding: 12px 0;
  }
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
  padding: 12px 0;
  border-bottom: 1px solid var(--echo-line);
  text-decoration: none;

  &__text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  &__title {
    font-size: 17px;
  }

  &--open &__title {
    font-weight: 600;
  }

  &__meta {
    font-size: 14px;
    color: var(--echo-muted);
  }

  &__chev {
    font-size: 22px;
    color: var(--echo-muted);
  }

  &:hover &__title {
    color: var(--echo-primary);
  }
}
</style>
