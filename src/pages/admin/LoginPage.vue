<script setup lang="ts">
// A1 登入（ux.md A1；AC5.1）：只輸入密碼，登入共用的管理帳號（spec D14）。
// 會友端沒有任何入口連到這裡，只能直接輸入網址。
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { services } from '@/services';
import { useAuthStore } from '@/stores/auth';
import { errorMessage } from '@/utils/errors';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const password = ref('');
const loading = ref(false);
const error = ref('');
const isMock = services.source === 'mock';

function target() {
  const r = route.query.redirect;
  return typeof r === 'string' && r.startsWith('/admin') ? r : '/admin';
}

async function submit() {
  if (loading.value) return;
  loading.value = true;
  error.value = '';
  try {
    await auth.signIn(password.value);
    await router.replace(target());
  } catch (e) {
    error.value = errorMessage(e);
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await auth.ensure();
  if (auth.isStaff) await router.replace(target());
});
</script>

<template>
  <div class="login">
    <div class="login__strip" aria-hidden="true" />
    <main class="login__box">
      <h1 class="login__brand">ECHO <span>管理</span></h1>
      <form class="login__form" @submit.prevent="submit">
        <div class="field">
          <label for="password" class="field__label">管理密碼</label>
          <input
            id="password"
            v-model="password"
            class="input"
            type="password"
            autocomplete="current-password"
            autofocus
            required
          />
        </div>
        <p v-if="error" class="field__error" role="alert">{{ error }}</p>
        <button type="submit" class="btn btn--primary btn--block btn--lg" :disabled="loading">
          <q-spinner v-if="loading" size="18px" />
          登入
        </button>
      </form>
      <p class="login__note">忘記密碼請聯絡系統管理者。</p>

      <div v-if="isMock" class="login__demo">
        <b>示範模式（假資料）</b>：任何密碼都可以登入；密碼 <code>wrong</code> → 密碼錯誤。
      </div>
      <router-link to="/" class="login__back">‹ 回會友首頁</router-link>
    </main>
  </div>
</template>

<style scoped lang="scss">
.login {
  min-height: 100vh;
  min-height: 100dvh;
  background: var(--echo-page);

  &__strip {
    height: 3px;
    background: var(--echo-primary);
  }

  &__box {
    max-width: 400px;
    margin: 0 auto;
    padding: 56px 20px 40px;
  }

  &__brand {
    margin: 0 0 28px;
    font-size: 20px;
    font-weight: 600;

    span {
      color: var(--echo-muted);
    }
  }

  &__form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  &__note {
    margin: 16px 0 0;
    font-size: 14px;
    color: var(--echo-muted);
  }

  &__demo {
    margin-top: 28px;
    padding: 12px 14px;
    border: 1px solid var(--echo-line);
    border-radius: var(--echo-radius-lg);
    background: var(--echo-bg);
    font-size: 14px;
    line-height: 1.7;

    code {
      font-size: 13px;
    }
  }

  &__back {
    display: inline-block;
    margin-top: 24px;
    font-size: 14px;
    color: var(--echo-muted);
    text-decoration: none;
  }
}
</style>
