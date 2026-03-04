<template>
  <q-page class="page-wrap">
    <div class="container q-pa-md">
      <VersionBanner :on-update="triggerUpdate" />

      <q-card flat bordered class="q-mb-md install-card" v-if="!isStandalone">
        <q-card-section class="row items-center justify-between q-col-gutter-md">
          <div class="col-12 col-md">
            <div class="text-subtitle1">Installeer WordCourt als app</div>
            <div class="text-caption text-grey-8">{{ installHint }}</div>
          </div>
          <div class="col-12 col-md-auto">
            <q-btn
              v-if="canPromptInstall"
              color="primary"
              label="Installeer app"
              @click="onInstallApp"
            />
          </div>
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
              <q-input
                v-model="authEmail"
                type="email"
                label="Email"
                autocapitalize="off"
                autocorrect="off"
                spellcheck="false"
                inputmode="email"
              />
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

      <template v-if="session.isAuthenticated">
        <div class="home-main-layout q-mb-md">
          <div class="home-main-left">
            <q-card flat bordered class="q-mb-md">
              <q-card-section>
                <div class="text-h6">Lobby acties</div>
                <div class="row q-gutter-sm q-mt-sm">
                  <q-btn color="primary" label="Nieuw spel" @click="onCreateGame" />
                  <q-btn color="secondary" outline label="Ververs" @click="loadLobbyData" />
                  <q-btn color="negative" outline label="Logout" @click="session.logout" />
                </div>
              </q-card-section>
            </q-card>

            <q-card flat bordered class="q-mb-md">
              <q-card-section>
                <div class="text-h6">Beschikbare spellen</div>
                <q-list separator>
                  <q-item v-for="game in availableGames" :key="game.id">
                    <q-item-section>
                      <q-item-label>
                        Game ID: <strong>{{ game.id }}</strong>
                      </q-item-label>
                      <q-item-label caption>
                        Owner: {{ game.ownerName }} • {{ game.participantCount }}/{{ game.maxPlayers }} spelers
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <div class="row q-gutter-sm items-center">
                        <q-btn
                          v-if="game.ownerId === session.userId"
                          color="negative"
                          flat
                          round
                          size="sm"
                          icon="delete"
                          @click="onDeleteLobbyGame(game.id)"
                        />
                        <q-btn
                          v-if="game.canJoin"
                          color="accent"
                          size="sm"
                          label="Neem deel"
                          @click="promptSecretForJoin(game.id)"
                        />
                        <q-badge v-else color="grey-6" text-color="white" label="Vol" />
                      </div>
                    </q-item-section>
                  </q-item>
                </q-list>
                <div v-if="!availableGames.length" class="text-caption text-grey-7 q-mt-sm">Geen open spellen gevonden.</div>
              </q-card-section>
            </q-card>

            <q-card flat bordered>
              <q-card-section>
                <div class="text-h6">Mijn actieve spellen</div>
                <q-list separator>
                  <q-item v-for="game in activeGames" :key="game.gameId">
                    <q-item-section>
                      <q-item-label>
                        Game ID: <strong>{{ game.gameId }}</strong>
                      </q-item-label>
                      <q-item-label caption>
                        Owner: {{ game.ownerName }} • {{ game.participantCount }} spelers • status: {{ game.status }}
                      </q-item-label>
                    </q-item-section>
                    <q-item-section side>
                      <div class="row q-gutter-sm items-center">
                        <q-btn
                          v-if="game.status === 'lobby' && game.ownerId === session.userId"
                          color="negative"
                          flat
                          round
                          size="sm"
                          icon="delete"
                          @click="onDeleteLobbyGame(game.gameId)"
                        />
                        <q-btn color="primary" size="sm" label="Ga naar spel" @click="openRemoteGame(game.gameId)" />
                      </div>
                    </q-item-section>
                  </q-item>
                </q-list>
                <div v-if="!activeGames.length" class="text-caption text-grey-7 q-mt-sm">Je speelt nu nog geen actieve spellen.</div>
              </q-card-section>
            </q-card>

            <q-card flat bordered class="q-mt-md">
              <q-card-section>
                <div class="text-h6">Spelers in lobby</div>
                <div class="presence-chip-wrap q-mt-sm">
                  <q-chip
                    v-for="entry in lobbyPresence"
                    :key="entry.id"
                    dense
                    color="grey-3"
                    text-color="dark"
                  >
                    <q-avatar v-if="entry.avatar_url">
                      <img :src="entry.avatar_url" :alt="entry.player_name" />
                    </q-avatar>
                    <q-avatar v-else color="primary" text-color="white">
                      {{ entry.player_name.charAt(0).toUpperCase() }}
                    </q-avatar>
                    {{ entry.player_name }}
                  </q-chip>
                </div>
                <div v-if="!lobbyPresence.length" class="text-caption text-grey-7 q-mt-sm">Er zijn nu geen spelers actief in de lobby.</div>
              </q-card-section>
            </q-card>

            <q-card flat bordered class="q-mt-md">
              <q-card-section class="row items-center justify-between q-col-gutter-md">
                <div class="col-12 col-md">
                  <div class="text-subtitle1">App Versiebeheer</div>
                  <div class="text-caption text-grey-8">Huidige versie: {{ currentVersion }}</div>
                  <div class="text-caption text-grey-8">Build datum: {{ buildDate }}</div>
                </div>
                <div class="col-12 col-md-auto">
                  <q-btn color="primary" :outline="!needRefresh" label="Update app" @click="triggerUpdate" />
                </div>
              </q-card-section>
            </q-card>
          </div>

          <q-card flat bordered class="home-main-right">
            <q-card-section>
              <div class="text-h6">Hasperen</div>
              <div class="row q-col-gutter-sm q-mt-sm">
                <div class="col">
                  <q-input
                    v-model="lobbyChatDraft"
                    dense
                    maxlength="500"
                    label="Typ een bericht in Hasperen"
                    @keyup.enter="onSendLobbyChat"
                  />
                </div>
                <div class="col-auto">
                  <q-btn color="primary" label="Verstuur" :disable="!lobbyChatDraft.trim()" @click="onSendLobbyChat" />
                </div>
              </div>
              <div class="lobby-chat-list-wrap q-mt-sm">
                <q-list separator>
                  <q-item v-for="entry in lobbyChatMessages" :key="entry.id" dense>
                    <q-item-section>
                      <q-item-label>
                        <strong>{{ entry.actor_name }}</strong>: {{ entry.message }}
                      </q-item-label>
                    </q-item-section>
                  </q-item>
                </q-list>
                <div v-if="!lobbyChatMessages.length" class="text-caption text-grey-7">
                  Nog geen berichten.
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

      </template>
    </div>

    <q-dialog v-model="secretDialogOpen" persistent>
      <q-card style="min-width: 420px">
        <q-card-section>
          <div class="text-h6">{{ pendingDialogMode === 'create' ? 'Nieuw spel aanmaken' : 'Deelnemen aan spel' }}</div>
          <div class="text-caption">Game ID: {{ pendingGameId || '-' }}</div>
        </q-card-section>

        <q-card-section>
          <q-input
            v-model="secretDialogValue"
            label="Geheim woord"
            maxlength="12"
          />
          <div class="text-caption text-grey-8 q-mt-sm secret-help">
            <div>Kies een woord tussen de 7 en 12 letters.</div>
            <div>Je mag zelf stippen toevoegen (max 5). Doe je dat niet, dan gebeurt dat automatisch.</div>
            <div class="q-mt-xs"><strong>Voorbeeld WOORDSPEL (9 letters, dus 3 stippen):</strong></div>
            <div><code>...WOORDSPEL</code>  of  <code>..WOORDSPEL.</code></div>
            <div><code>.WOORDSPEL..</code>  of  <code>WOORDSPEL...</code></div>
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat label="Annuleren" v-close-popup />
          <q-btn
            color="primary"
            :label="pendingDialogMode === 'create' ? 'Maak spel aan' : 'Bevestig deelname'"
            @click="confirmSecretJoin"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionStore } from '@/stores/sessionStore';
import VersionBanner from '@/components/VersionBanner.vue';
import { useSwUpdate } from '@/services/swUpdate';
import { appVersion } from '@/services/version';
import { settings } from '@/config/settings';
import { collections, pb } from '@/services/pocketbase';
import {
  createRemoteGame,
  deleteLobbyGame,
  joinRemoteGame,
  listLobbyChatMessages,
  listLobbyPresence,
  listActiveGameLinks,
  listLobbyGames,
  removeLobbyPresence,
  sendLobbyChatMessage,
  upsertLobbyPresence,
  type ActiveGameLink,
  type LobbyChatMessage,
  type LobbyPresenceEntry,
  type LobbyGameSummary
} from '@/services/gameSync';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const router = useRouter();
const $q = useQuasar();
const session = useSessionStore();
const { updateApp, needRefresh } = useSwUpdate();
const currentVersion = appVersion;
const buildDate = formatBuildDate(__BUILD_DATE__);

const authName = ref('');
const authEmail = ref('');
const authPassword = ref('');

const lobbyGames = ref<LobbyGameSummary[]>([]);
const activeGames = ref<ActiveGameLink[]>([]);
const lobbyChatMessages = ref<LobbyChatMessage[]>([]);
const lobbyPresence = ref<LobbyPresenceEntry[]>([]);
const lobbyChatDraft = ref('');
const availableGames = computed(() => lobbyGames.value.filter((game) => !game.hasJoined));

const secretDialogOpen = ref(false);
const secretDialogValue = ref('');
const pendingGameId = ref('');
const pendingDialogMode = ref<'create' | 'join'>('join');
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let presenceTimer: ReturnType<typeof setInterval> | null = null;
let stopLobbyRealtime: (() => void) | null = null;
let lastPresenceUserId = '';
const isStandalone = ref(false);
const canPromptInstall = ref(false);
const deferredInstallPrompt = ref<BeforeInstallPromptEvent | null>(null);
let installMediaQuery: MediaQueryList | null = null;
const installHint = computed(() => {
  if (isStandalone.value) {
    return 'WordCourt is al als app geinstalleerd.';
  }
  const ua = navigator.userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua);
  const isAndroid = /android/.test(ua);
  const isSafari = /safari/.test(ua) && !/chrome|crios|fxios|edgios|opr/.test(ua);
  const isChromeFamily = /chrome|crios|edg|opr/.test(ua);

  if (isIos && isSafari) {
    return 'Open Safari en kies Deel > Zet op beginscherm om WordCourt als app te installeren.';
  }
  if (isIos) {
    return 'Op iPhone/iPad werkt installeren het best via Safari: open deze pagina in Safari en kies Deel > Zet op beginscherm.';
  }
  if (isAndroid && canPromptInstall.value) {
    return 'Installeer WordCourt via de knop hieronder of via browsermenu > Install app / Add to Home screen.';
  }
  if (isAndroid) {
    return 'Installeer via browsermenu > Install app / Add to Home screen voor gebruik als app.';
  }
  if (isChromeFamily && canPromptInstall.value) {
    return 'Gebruik de knop hieronder of klik op het install-icoon in de adresbalk om WordCourt te installeren.';
  }
  return 'Installeer via het browsermenu (meestal: Install app, Apps installeren of Add to Home screen) voor de beste ervaring.';
});

function updateStandaloneState(): void {
  const byDisplayMode = window.matchMedia('(display-mode: standalone)').matches;
  const byNavigator = Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  isStandalone.value = byDisplayMode || byNavigator;
}

function onInstallPromptAvailable(event: Event): void {
  event.preventDefault();
  deferredInstallPrompt.value = event as BeforeInstallPromptEvent;
  canPromptInstall.value = true;
}

async function onInstallApp(): Promise<void> {
  if (!deferredInstallPrompt.value) return;
  try {
    await deferredInstallPrompt.value.prompt();
    await deferredInstallPrompt.value.userChoice;
  } finally {
    deferredInstallPrompt.value = null;
    canPromptInstall.value = false;
  }
}

function onAppInstalled(): void {
  deferredInstallPrompt.value = null;
  canPromptInstall.value = false;
  updateStandaloneState();
}

function onDisplayModeChange(): void {
  updateStandaloneState();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

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
    lobbyChatMessages.value = [];
    lobbyPresence.value = [];
    return;
  }

  try {
    const [gamesResult, activeResult, chatResult, presenceResult] = await Promise.allSettled([
      listLobbyGames(session.userId),
      listActiveGameLinks(session.userId),
      listLobbyChatMessages().catch(() => []),
      listLobbyPresence().catch(() => [])
    ]);

    if (gamesResult.status === 'fulfilled') {
      lobbyGames.value = gamesResult.value;
    } else {
      lobbyGames.value = [];
    }

    if (activeResult.status === 'fulfilled') {
      activeGames.value = activeResult.value;
    } else {
      activeGames.value = [];
    }

    if (chatResult.status === 'fulfilled') {
      lobbyChatMessages.value = chatResult.value;
    } else {
      lobbyChatMessages.value = [];
    }

    if (presenceResult.status === 'fulfilled') {
      lobbyPresence.value = presenceResult.value;
    } else {
      lobbyPresence.value = [];
    }

    if (gamesResult.status === 'rejected' || activeResult.status === 'rejected') {
      const err = gamesResult.status === 'rejected'
        ? gamesResult.reason
        : (activeResult.status === 'rejected' ? activeResult.reason : null);
      if (!err) return;
      const msg = errorMessage(err);
      if (!msg.includes('request was aborted')) {
        $q.notify({ type: 'negative', message: `Lobby laden deels mislukt: ${msg}` });
      }
    }
  } catch (error) {
    const msg = errorMessage(error);
    if (msg.includes('request was aborted')) return;
    $q.notify({ type: 'negative', message: `Lobby laden mislukt: ${msg}` });
  }
}

function scheduleLobbyRefresh(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    void loadLobbyData();
  }, 120);
}

async function setupLobbyRealtime(): Promise<void> {
  if (stopLobbyRealtime) {
    stopLobbyRealtime();
    stopLobbyRealtime = null;
  }
  if (!session.isAuthenticated || !settings.realtimeEnabled) return;

  const unsubs: Array<() => void | Promise<void>> = [];
  const onAnyLobbyChange = () => {
    scheduleLobbyRefresh();
  };

  const unsubGames = await pb.collection(collections.games).subscribe('*', onAnyLobbyChange);
  unsubs.push(unsubGames);

  const unsubPlayers = await pb.collection(collections.players).subscribe('*', onAnyLobbyChange);
  unsubs.push(unsubPlayers);

  const unsubLobbyChat = await pb.collection(collections.lobbyChatMessages).subscribe('*', onAnyLobbyChange).catch(() => null);
  if (unsubLobbyChat) {
    unsubs.push(unsubLobbyChat);
  }

  const unsubPresence = await pb.collection(collections.lobbyPresence).subscribe('*', onAnyLobbyChange).catch(() => null);
  if (unsubPresence) {
    unsubs.push(unsubPresence);
  }

  stopLobbyRealtime = () => {
    for (const unsub of unsubs) {
      void unsub();
    }
  };
}

async function heartbeatLobbyPresence(): Promise<void> {
  if (!session.isAuthenticated || !session.userId) return;
  await upsertLobbyPresence(session.userId).catch(() => null);
}

function setupLobbyPresenceHeartbeat(): void {
  if (presenceTimer) {
    clearInterval(presenceTimer);
    presenceTimer = null;
  }
  if (!session.isAuthenticated || !session.userId) return;
  lastPresenceUserId = session.userId;
  void heartbeatLobbyPresence();
  presenceTimer = setInterval(() => {
    void heartbeatLobbyPresence();
  }, 30_000);
}

async function onSendLobbyChat(): Promise<void> {
  if (!session.userId || !session.isAuthenticated) return;
  try {
    await sendLobbyChatMessage(session.userId, lobbyChatDraft.value);
    lobbyChatDraft.value = '';
  } catch (error) {
    $q.notify({ type: 'negative', message: `Hasperen versturen mislukt: ${errorMessage(error)}` });
  }
}

async function login(): Promise<void> {
  try {
    await session.login({ email: normalizeEmail(authEmail.value), password: authPassword.value });
    $q.notify({ type: 'positive', message: 'Ingelogd' });
    await loadLobbyData();
  } catch (error) {
    $q.notify({ type: 'negative', message: `Login mislukt: ${errorMessage(error)}` });
  }
}

async function register(): Promise<void> {
  try {
    const normalizedEmail = normalizeEmail(authEmail.value);
    await session.register({
      name: authName.value.trim() || normalizedEmail,
      email: normalizedEmail,
      password: authPassword.value
    });
    $q.notify({ type: 'positive', message: 'Account aangemaakt en ingelogd' });
    await loadLobbyData();
  } catch (error) {
    $q.notify({ type: 'negative', message: `Register mislukt: ${errorMessage(error)}` });
  }
}

async function onCreateGame(): Promise<void> {
  if (!session.userId) {
    $q.notify({ type: 'warning', message: 'Login is vereist' });
    return;
  }

  try {
    pendingDialogMode.value = 'create';
    pendingGameId.value = '';
    secretDialogValue.value = '';
    secretDialogOpen.value = true;
  } catch (error) {
    $q.notify({ type: 'negative', message: `Spel aanmaken mislukt: ${errorMessage(error)}` });
  }
}

async function onDeleteLobbyGame(gameId: string): Promise<void> {
  if (!session.userId) return;
  if (!window.confirm('Weet je zeker dat je dit lobby-spel wilt verwijderen?')) return;

  try {
    await deleteLobbyGame(gameId);
    $q.notify({ type: 'positive', message: 'Lobby-spel verwijderd' });
    await loadLobbyData();
  } catch (error) {
    $q.notify({ type: 'negative', message: `Verwijderen mislukt: ${errorMessage(error)}` });
  }
}

function promptSecretForJoin(gameId: string): void {
  pendingDialogMode.value = 'join';
  pendingGameId.value = gameId;
  secretDialogValue.value = '';
  secretDialogOpen.value = true;
}

async function confirmSecretJoin(): Promise<void> {
  if (!session.userId || !secretDialogValue.value.trim()) {
    $q.notify({ type: 'warning', message: 'Vul een woord in met 7 t/m 12 letters' });
    return;
  }

  try {
    if (pendingDialogMode.value === 'create') {
      const game = await createRemoteGame(session.userId, 'classic');
      pendingGameId.value = game.id;
    } else if (!pendingGameId.value) {
      $q.notify({ type: 'warning', message: 'Geen doelspel geselecteerd' });
      return;
    }

    await joinRemoteGame(pendingGameId.value, session.userId, secretDialogValue.value.trim());
    secretDialogOpen.value = false;
    $q.notify({ type: 'positive', message: 'Deelname bevestigd' });
    await loadLobbyData();
    openRemoteGame(pendingGameId.value);
  } catch (error) {
    $q.notify({ type: 'negative', message: `Deelname mislukt: ${errorMessage(error)}` });
  }
}

function openRemoteGame(gameId: string): void {
  router.push({ name: 'game', params: { gameId } });
}

function triggerUpdate(): void {
  void updateApp();
}

function formatBuildDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

watch(
  () => session.isAuthenticated,
  async () => {
    if (!session.isAuthenticated && lastPresenceUserId) {
      void removeLobbyPresence(lastPresenceUserId);
      lastPresenceUserId = '';
    }
    await loadLobbyData();
    await setupLobbyRealtime();
    setupLobbyPresenceHeartbeat();
  }
);

onMounted(async () => {
  updateStandaloneState();
  installMediaQuery = window.matchMedia('(display-mode: standalone)');
  installMediaQuery.addEventListener('change', onDisplayModeChange);
  window.addEventListener('beforeinstallprompt', onInstallPromptAvailable as EventListener);
  window.addEventListener('appinstalled', onAppInstalled);

  await loadLobbyData();
  await setupLobbyRealtime();
  setupLobbyPresenceHeartbeat();
});

onUnmounted(() => {
  if (presenceTimer) clearInterval(presenceTimer);
  if (refreshTimer) clearTimeout(refreshTimer);
  if (stopLobbyRealtime) stopLobbyRealtime();
  if (lastPresenceUserId) {
    void removeLobbyPresence(lastPresenceUserId);
    lastPresenceUserId = '';
  }
  installMediaQuery?.removeEventListener('change', onDisplayModeChange);
  installMediaQuery = null;
  window.removeEventListener('beforeinstallprompt', onInstallPromptAvailable as EventListener);
  window.removeEventListener('appinstalled', onAppInstalled);
});
</script>

<style scoped>
.install-card {
  border-color: rgba(25, 118, 210, 0.35);
  background: rgba(25, 118, 210, 0.04);
}

.secret-help {
  line-height: 1.35;
}

.secret-help code {
  font-size: 12px;
  background: #f3f3f3;
  padding: 1px 4px;
  border-radius: 4px;
}

.lobby-chat-list-wrap {
  max-height: min(52vh, 560px);
  overflow-y: auto;
  overflow-x: hidden;
}

.home-main-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.home-main-left,
.home-main-right {
  min-width: 0;
}

.presence-chip-wrap {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

@media (min-width: 1024px) {
  .home-main-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }

  .home-main-left {
    width: auto;
  }

  .home-main-right {
    width: auto;
    max-height: calc(100vh - 210px);
  }

  .home-main-right :deep(.q-card__section) {
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: calc(100vh - 240px);
  }

  .home-main-right .lobby-chat-list-wrap {
    flex: 1;
    max-height: calc(100vh - 315px);
    min-height: 0;
  }
}
</style>
