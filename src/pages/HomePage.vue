<template>
  <q-page class="page-wrap">
    <div class="container q-pa-md">
      <VersionBanner :on-update="triggerUpdate" />

      <q-card flat bordered class="q-mb-md">
        <q-card-section class="row items-center justify-between">
          <div>
            <div class="text-h5">Probe PWA</div>
            <div class="text-body2 text-grey-8">Realtime via PocketBase lobby.</div>
          </div>
          <q-chip color="primary" text-color="white" :label="session.isAuthenticated ? `Ingelogd als ${session.displayName}` : 'Niet ingelogd'" />
        </q-card-section>
      </q-card>

      <q-card flat bordered class="q-mb-md" v-if="!session.isAuthenticated">
        <q-card-section>
          <div class="text-h6">Login / Register (PocketBase)</div>
          <div class="row q-col-gutter-md q-mt-sm">
            <div class="col-12 col-md-4">
              <q-input v-model="authName" label="Naam (voor register)" />
            </div>
            <div class="col-12 col-md-4">
              <q-input v-model="authEmail" label="Email" />
            </div>
            <div class="col-12 col-md-4">
              <q-input v-model="authPassword" type="password" label="Wachtwoord" />
            </div>
          </div>
          <div class="row q-gutter-sm q-mt-md">
            <q-btn color="primary" label="Login" @click="login" />
            <q-btn color="secondary" label="Register" @click="register" />
          </div>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="q-mb-md" v-else>
        <q-card-section class="row items-center justify-between">
          <div class="text-subtitle1">Account actief: {{ session.displayName }}</div>
          <q-btn color="negative" outline label="Logout" @click="session.logout" />
        </q-card-section>
      </q-card>

      <q-card flat bordered class="q-mb-md" v-if="session.isAuthenticated">
        <q-card-section>
          <div class="text-h6">Lobby</div>
          <div class="row q-col-gutter-md q-mt-sm">
            <div class="col-12 col-md-4">
              <q-input
                v-model="remoteSecret"
                label="Jouw geheime woord"
                hint="Max 12 chars, dots met ."
                maxlength="12"
              />
            </div>
            <div class="col-12 col-md-4">
              <q-input v-model="joinCode" label="Join-code of game-id (bijv. 1234)" />
            </div>
            <div class="col-12 col-md-4 flex items-end">
              <div class="row q-gutter-sm">
                <q-btn color="primary" label="Nieuwe lobby" @click="createRemote" />
                <q-btn color="accent" label="Join lobby" @click="joinRemote" />
              </div>
            </div>
          </div>

          <div class="q-mt-md" v-if="remoteGameId">
            <div class="text-caption">Remote game record ID: {{ remoteGameId }}</div>
            <div class="text-caption" v-if="activeJoinCode">Join-code: {{ activeJoinCode }}</div>
            <q-btn class="q-mt-sm" color="primary" outline label="Open remote game" @click="openRemoteGame" />
          </div>
        </q-card-section>
      </q-card>

      <AppVersionPanel class="q-mt-md" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionStore } from '@/stores/sessionStore';
import VersionBanner from '@/components/VersionBanner.vue';
import AppVersionPanel from '@/components/AppVersionPanel.vue';
import { useSwUpdate } from '@/services/swUpdate';
import { createRemoteGame, joinRemoteGame, resolveRemoteGameId } from '@/services/gameSync';

const router = useRouter();
const $q = useQuasar();
const session = useSessionStore();
const { updateApp } = useSwUpdate();

const authName = ref('');
const authEmail = ref('');
const authPassword = ref('');
const remoteSecret = ref('');
const joinCode = ref('');
const activeJoinCode = ref('');
const remoteGameId = ref('');

function errorMessage(error: unknown): string {
  const anyError = error as {
    response?: { message?: string; data?: Record<string, unknown> };
    message?: string;
  };
  const details = anyError?.response?.data ? ` ${JSON.stringify(anyError.response.data)}` : '';
  return `${anyError?.response?.message ?? anyError?.message ?? String(error)}${details}`;
}

async function login(): Promise<void> {
  try {
    await session.login({ email: authEmail.value.trim(), password: authPassword.value });
    $q.notify({ type: 'positive', message: 'Ingelogd' });
  } catch (error) {
    $q.notify({ type: 'negative', message: `Login mislukt: ${errorMessage(error)}` });
  }
}

async function register(): Promise<void> {
  try {
    await session.register({
      name: authName.value.trim() || authEmail.value.trim(),
      email: authEmail.value.trim(),
      password: authPassword.value
    });
    $q.notify({ type: 'positive', message: 'Account aangemaakt en ingelogd' });
  } catch (error) {
    $q.notify({ type: 'negative', message: `Register mislukt: ${errorMessage(error)}` });
  }
}

async function createRemote(): Promise<void> {
  if (!session.userId || !remoteSecret.value.trim() || !joinCode.value.trim()) {
    $q.notify({ type: 'warning', message: 'Login, geheim woord en join-code zijn verplicht' });
    return;
  }

  try {
    const game = await createRemoteGame(session.userId, 'classic', joinCode.value.trim());
    await joinRemoteGame(game.id, session.userId, remoteSecret.value.trim());
    remoteGameId.value = game.id;
    activeJoinCode.value = joinCode.value.trim();
    $q.notify({ type: 'positive', message: `Lobby aangemaakt: ${game.id}` });
  } catch (error) {
    $q.notify({ type: 'negative', message: `Lobby aanmaken mislukt: ${errorMessage(error)}` });
  }
}

async function joinRemote(): Promise<void> {
  if (!session.userId || !joinCode.value.trim() || !remoteSecret.value.trim()) {
    $q.notify({ type: 'warning', message: 'Login, geheim woord en join-code/game-id zijn verplicht' });
    return;
  }

  try {
    const resolvedGameId = await resolveRemoteGameId(joinCode.value.trim());
    await joinRemoteGame(resolvedGameId, session.userId, remoteSecret.value.trim());
    remoteGameId.value = resolvedGameId;
    activeJoinCode.value = joinCode.value.trim();
    $q.notify({ type: 'positive', message: `Joined lobby: ${remoteGameId.value}` });
  } catch (error) {
    $q.notify({ type: 'negative', message: `Join mislukt: ${errorMessage(error)}` });
  }
}

function openRemoteGame(): void {
  if (!remoteGameId.value) return;
  router.push({ name: 'game', params: { gameId: remoteGameId.value } });
}

function triggerUpdate(): void {
  void updateApp();
}
</script>
