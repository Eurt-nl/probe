<template>
  <q-page class="page-wrap">
    <div class="container q-pa-md">
      <VersionBanner :on-update="triggerUpdate" />

      <q-card flat bordered class="q-mb-md">
        <q-card-section class="row items-center justify-between">
          <div>
            <div class="text-h5">Probe PWA</div>
            <div class="text-body2 text-grey-8">Realtime lobby en meerdere actieve spellen per speler.</div>
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

      <template v-if="session.isAuthenticated">
        <q-card flat bordered class="q-mb-md">
          <q-card-section>
            <div class="text-h6">Nieuwe of bestaande lobby</div>
            <div class="row q-col-gutter-md q-mt-sm">
              <div class="col-12 col-md-6">
                <q-input v-model="joinCodeInput" label="Join-code (bijv. 1234)" />
              </div>
              <div class="col-12 col-md-6 flex items-end">
                <div class="row q-gutter-sm">
                  <q-btn color="primary" label="Nieuw spel" @click="onCreateGame" />
                  <q-btn color="accent" label="Join via code" @click="onJoinByCode" />
                  <q-btn color="secondary" outline label="Ververs" @click="loadLobbyData" />
                </div>
              </div>
            </div>
          </q-card-section>
        </q-card>

        <q-card flat bordered class="q-mb-md">
          <q-card-section>
            <div class="text-h6">Beschikbare spellen</div>
            <q-list separator>
              <q-item v-for="game in lobbyGames" :key="game.id">
                <q-item-section>
                  <q-item-label>
                    Code: <strong>{{ game.joinCode || '(geen code)' }}</strong>
                  </q-item-label>
                  <q-item-label caption>
                    Owner: {{ game.ownerName }} • {{ game.participantCount }}/{{ game.maxPlayers }} spelers
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <div class="row q-gutter-sm">
                    <q-btn
                      v-if="game.hasJoined"
                      color="primary"
                      outline
                      size="sm"
                      label="Open"
                      @click="openRemoteGame(game.id, game.joinCode)"
                    />
                    <q-btn
                      v-else-if="game.canJoin"
                      color="accent"
                      size="sm"
                      label="Neem deel"
                      @click="promptSecretForJoin(game.id, game.joinCode)"
                    />
                    <q-badge v-else color="grey-6" text-color="white" label="Vol" />
                  </div>
                </q-item-section>
              </q-item>
            </q-list>
            <div v-if="!lobbyGames.length" class="text-caption text-grey-7 q-mt-sm">Geen open spellen gevonden.</div>
          </q-card-section>
        </q-card>

        <q-card flat bordered class="q-mb-md">
          <q-card-section>
            <div class="text-h6">Mijn actieve spellen</div>
            <q-list separator>
              <q-item v-for="game in activeGames" :key="game.gameId">
                <q-item-section>
                  <q-item-label>
                    Code: <strong>{{ game.joinCode || '(geen code)' }}</strong>
                  </q-item-label>
                  <q-item-label caption>
                    Owner: {{ game.ownerName }} • {{ game.participantCount }} spelers
                  </q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-btn color="primary" size="sm" label="Ga naar spel" @click="openRemoteGame(game.gameId, game.joinCode)" />
                </q-item-section>
              </q-item>
            </q-list>
            <div v-if="!activeGames.length" class="text-caption text-grey-7 q-mt-sm">Je speelt nu nog geen actieve spellen.</div>
          </q-card-section>
        </q-card>
      </template>

      <AppVersionPanel class="q-mt-md" />
    </div>

    <q-dialog v-model="secretDialogOpen" persistent>
      <q-card style="min-width: 420px">
        <q-card-section>
          <div class="text-h6">Geheim woord invullen</div>
          <div class="text-caption">Code: {{ pendingJoinCode || '(geen code)' }}</div>
        </q-card-section>

        <q-card-section>
          <q-input
            v-model="secretDialogValue"
            label="Geheim woord"
            hint="Max 12 chars, dots met ."
            maxlength="12"
          />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Annuleren" v-close-popup />
          <q-btn color="primary" label="Bevestig deelname" @click="confirmSecretJoin" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionStore } from '@/stores/sessionStore';
import VersionBanner from '@/components/VersionBanner.vue';
import AppVersionPanel from '@/components/AppVersionPanel.vue';
import { useSwUpdate } from '@/services/swUpdate';
import {
  createRemoteGame,
  joinRemoteGame,
  listActiveGameLinks,
  listLobbyGames,
  resolveRemoteGameId,
  type ActiveGameLink,
  type LobbyGameSummary
} from '@/services/gameSync';

const router = useRouter();
const $q = useQuasar();
const session = useSessionStore();
const { updateApp } = useSwUpdate();

const authName = ref('');
const authEmail = ref('');
const authPassword = ref('');
const joinCodeInput = ref('');
const activeJoinCode = ref('');
const remoteGameId = ref('');

const lobbyGames = ref<LobbyGameSummary[]>([]);
const activeGames = ref<ActiveGameLink[]>([]);

const secretDialogOpen = ref(false);
const secretDialogValue = ref('');
const pendingGameId = ref('');
const pendingJoinCode = ref('');

function errorMessage(error: unknown): string {
  const anyError = error as {
    response?: { message?: string; data?: Record<string, unknown> };
    message?: string;
  };
  const details = anyError?.response?.data ? ` ${JSON.stringify(anyError.response.data)}` : '';
  return `${anyError?.response?.message ?? anyError?.message ?? String(error)}${details}`;
}

async function loadLobbyData(): Promise<void> {
  if (!session.isAuthenticated || !session.userId) {
    lobbyGames.value = [];
    activeGames.value = [];
    return;
  }

  lobbyGames.value = await listLobbyGames(session.userId);
  activeGames.value = await listActiveGameLinks(session.userId);
}

async function login(): Promise<void> {
  try {
    await session.login({ email: authEmail.value.trim(), password: authPassword.value });
    $q.notify({ type: 'positive', message: 'Ingelogd' });
    await loadLobbyData();
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
    await loadLobbyData();
  } catch (error) {
    $q.notify({ type: 'negative', message: `Register mislukt: ${errorMessage(error)}` });
  }
}

async function onCreateGame(): Promise<void> {
  if (!session.userId || !joinCodeInput.value.trim()) {
    $q.notify({ type: 'warning', message: 'Join-code is verplicht voor nieuw spel' });
    return;
  }

  try {
    const game = await createRemoteGame(session.userId, 'classic', joinCodeInput.value.trim());
    pendingGameId.value = game.id;
    pendingJoinCode.value = joinCodeInput.value.trim();
    secretDialogValue.value = '';
    secretDialogOpen.value = true;
    await loadLobbyData();
  } catch (error) {
    $q.notify({ type: 'negative', message: `Spel aanmaken mislukt: ${errorMessage(error)}` });
  }
}

async function onJoinByCode(): Promise<void> {
  if (!session.userId || !joinCodeInput.value.trim()) {
    $q.notify({ type: 'warning', message: 'Vul een join-code of game-id in' });
    return;
  }

  try {
    const gameId = await resolveRemoteGameId(joinCodeInput.value.trim());
    pendingGameId.value = gameId;
    pendingJoinCode.value = joinCodeInput.value.trim();
    secretDialogValue.value = '';
    secretDialogOpen.value = true;
  } catch (error) {
    $q.notify({ type: 'negative', message: `Join mislukt: ${errorMessage(error)}` });
  }
}

function promptSecretForJoin(gameId: string, joinCode: string): void {
  pendingGameId.value = gameId;
  pendingJoinCode.value = joinCode;
  secretDialogValue.value = '';
  secretDialogOpen.value = true;
}

async function confirmSecretJoin(): Promise<void> {
  if (!session.userId || !pendingGameId.value || !secretDialogValue.value.trim()) {
    $q.notify({ type: 'warning', message: 'Geheim woord is verplicht' });
    return;
  }

  try {
    await joinRemoteGame(pendingGameId.value, session.userId, secretDialogValue.value.trim());
    remoteGameId.value = pendingGameId.value;
    activeJoinCode.value = pendingJoinCode.value;
    secretDialogOpen.value = false;
    $q.notify({ type: 'positive', message: 'Deelname bevestigd' });
    await loadLobbyData();
  } catch (error) {
    $q.notify({ type: 'negative', message: `Deelname mislukt: ${errorMessage(error)}` });
  }
}

function openRemoteGame(gameId: string, joinCode: string): void {
  remoteGameId.value = gameId;
  activeJoinCode.value = joinCode;
  router.push({ name: 'game', params: { gameId } });
}

function triggerUpdate(): void {
  void updateApp();
}

watch(
  () => session.isAuthenticated,
  async () => {
    await loadLobbyData();
  }
);

onMounted(async () => {
  await loadLobbyData();
});
</script>
