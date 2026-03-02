<template>
  <q-page class="page-wrap">
    <div class="container q-pa-md">
      <VersionBanner :on-update="triggerUpdate" />

      <q-card flat bordered class="q-mb-md">
        <q-card-section class="row items-center justify-between">
          <div>
            <div class="text-h5">Probe PWA</div>
            <div class="text-body2 text-grey-8">Lokaal spelen of realtime via PocketBase lobby.</div>
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
          <div class="text-h6">Remote Lobby (PocketBase realtime)</div>
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
              <q-input v-model="joinGameId" label="Game ID om te joinen" />
            </div>
            <div class="col-12 col-md-4 flex items-end">
              <div class="row q-gutter-sm">
                <q-btn color="primary" label="Nieuwe lobby" @click="createRemote" />
                <q-btn color="accent" label="Join lobby" @click="joinRemote" />
              </div>
            </div>
          </div>

          <div class="q-mt-md" v-if="remoteGameId">
            <div class="text-caption">Remote game: {{ remoteGameId }}</div>
            <q-btn class="q-mt-sm" color="primary" outline label="Open remote game" @click="openRemoteGame" />
          </div>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="q-mb-md">
        <q-card-section class="row q-col-gutter-md">
          <div class="col-12 col-md-4">
            <q-input v-model="ownerName" label="Jouw naam" />
          </div>
          <div class="col-12 col-md-4">
            <q-input
              v-model="ownerSecret"
              label="Jouw geheime woord"
              hint="Max 12 chars, dots met ."
              maxlength="12"
            />
          </div>
          <div class="col-12 col-md-4 flex items-end">
            <q-btn color="primary" label="Nieuw lokaal spel" unelevated @click="createLocalGame" />
          </div>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="q-mb-md" v-if="localGame">
        <q-card-section>
          <div class="text-h6">Lokaal spelers toevoegen</div>
          <div class="row q-col-gutter-md q-mt-sm">
            <div class="col-12 col-md-4">
              <q-input v-model="newPlayerName" label="Naam speler" />
            </div>
            <div class="col-12 col-md-4">
              <q-input v-model="newPlayerSecret" label="Geheime woord" maxlength="12" />
            </div>
            <div class="col-12 col-md-4 flex items-end">
              <q-btn color="secondary" label="Speler toevoegen" @click="addLocalPlayer" />
            </div>
          </div>
        </q-card-section>
      </q-card>

      <q-card flat bordered v-if="localGame">
        <q-card-section class="row items-center justify-between">
          <div>
            <div class="text-subtitle1">Lokale Game ID</div>
            <div class="text-caption">{{ localGame.id }}</div>
          </div>
          <div class="row q-gutter-sm">
            <q-btn color="accent" label="Start lokaal spel" :disable="localGame.players.length < 2" @click="startLocalGame" />
            <q-btn color="primary" outline label="Open lokaal spel" @click="openLocalGame" />
          </div>
        </q-card-section>
      </q-card>

      <AppVersionPanel class="q-mt-md" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useGameStore } from '@/stores/gameStore';
import { useSessionStore } from '@/stores/sessionStore';
import VersionBanner from '@/components/VersionBanner.vue';
import AppVersionPanel from '@/components/AppVersionPanel.vue';
import { useSwUpdate } from '@/services/swUpdate';
import { createRemoteGame, joinRemoteGame } from '@/services/gameSync';

const router = useRouter();
const $q = useQuasar();
const gameStore = useGameStore();
const session = useSessionStore();
const { updateApp } = useSwUpdate();

const ownerName = ref('');
const ownerSecret = ref('');
const newPlayerName = ref('');
const newPlayerSecret = ref('');

const authName = ref('');
const authEmail = ref('');
const authPassword = ref('');
const remoteSecret = ref('');
const joinGameId = ref('');
const remoteGameId = ref('');

const localGame = computed(() => gameStore.game);

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
  if (!session.userId || !remoteSecret.value.trim()) {
    $q.notify({ type: 'warning', message: 'Login en vul geheim woord in' });
    return;
  }

  try {
    const game = await createRemoteGame(session.userId);
    await joinRemoteGame(game.id, session.userId, remoteSecret.value.trim());
    remoteGameId.value = game.id;
    $q.notify({ type: 'positive', message: `Lobby aangemaakt: ${game.id}` });
  } catch (error) {
    $q.notify({ type: 'negative', message: `Lobby aanmaken mislukt: ${errorMessage(error)}` });
  }
}

async function joinRemote(): Promise<void> {
  if (!session.userId || !joinGameId.value.trim() || !remoteSecret.value.trim()) {
    $q.notify({ type: 'warning', message: 'Vul game ID en geheim woord in' });
    return;
  }

  try {
    await joinRemoteGame(joinGameId.value.trim(), session.userId, remoteSecret.value.trim());
    remoteGameId.value = joinGameId.value.trim();
    $q.notify({ type: 'positive', message: `Joined lobby: ${remoteGameId.value}` });
  } catch (error) {
    $q.notify({ type: 'negative', message: `Join mislukt: ${errorMessage(error)}` });
  }
}

function openRemoteGame(): void {
  if (!remoteGameId.value) return;
  router.push({ name: 'game', params: { gameId: remoteGameId.value }, query: { mode: 'remote' } });
}

function createLocalGame(): void {
  if (!ownerName.value.trim() || !ownerSecret.value.trim()) return;
  gameStore.createGame(ownerName.value.trim(), ownerSecret.value.trim());
}

function addLocalPlayer(): void {
  if (!newPlayerName.value.trim() || !newPlayerSecret.value.trim()) return;
  gameStore.addPlayer(newPlayerName.value.trim(), newPlayerSecret.value.trim());
  newPlayerName.value = '';
  newPlayerSecret.value = '';
}

function startLocalGame(): void {
  gameStore.startGame();
  openLocalGame();
}

function openLocalGame(): void {
  if (!gameStore.game) return;
  router.push({ name: 'game', params: { gameId: gameStore.game.id }, query: { mode: 'local' } });
}

function triggerUpdate(): void {
  void updateApp();
}
</script>
