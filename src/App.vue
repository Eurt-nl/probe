<template>
  <q-layout view="lHh Lpr lFf">
    <q-header bordered class="bg-primary text-white">
      <q-toolbar>
        <q-toolbar-title>WordCourt</q-toolbar-title>
        <span v-if="session.isAuthenticated" class="header-user-label">
          Ingelogd als {{ session.displayName }}
        </span>
        <q-btn
          v-if="session.isAuthenticated"
          flat
          color="white"
          no-caps
          class="profile-btn"
          @click="router.push({ name: 'profile' })"
        >
          <span class="profile-btn__label">PROFIEL</span>
          <q-avatar v-if="headerAvatarUrl" size="28px" class="q-ml-sm">
            <img :src="headerAvatarUrl" alt="Avatar" />
          </q-avatar>
          <q-icon v-else name="account_circle" size="28px" class="q-ml-sm" />
        </q-btn>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>

    <SplashProbe v-if="showSplash" @done="showSplash = false" />
  </q-layout>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useSessionStore } from '@/stores/sessionStore';
import { pb } from '@/services/pocketbase';
import SplashProbe from '@/components/SplashProbe.vue';

const router = useRouter();
const session = useSessionStore();
const showSplash = ref(true);

const headerAvatarUrl = computed(() => {
  const avatar = String(session.user?.avatar ?? '');
  if (!avatar || !session.user) return '';
  return pb.files.getURL(session.user as Record<string, unknown>, avatar);
});
</script>

<style scoped>
.profile-btn {
  padding-right: 4px;
}

.header-user-label {
  margin-right: 8px;
  font-weight: 500;
  font-size: 14px;
  white-space: nowrap;
}

.profile-btn__label {
  font-weight: 600;
  letter-spacing: 0.02em;
}
</style>
