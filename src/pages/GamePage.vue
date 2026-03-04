<template>
  <q-page class="page-wrap">
    <div class="container q-pa-md">
      <VersionBanner :on-update="triggerUpdate" />

      <q-card flat bordered class="q-mb-md">
        <q-card-section class="row items-center justify-between">
          <div>
            <div class="text-h6">Remote game: {{ gameId }}</div>
            <div class="text-caption">
              Status: {{ remoteGame?.status ?? '-' }} |
              Beurt: {{ currentTurnPlayerName }}
            </div>
          </div>
          <div class="row q-gutter-sm">
            <q-btn color="secondary" outline label="Lobby" @click="router.push({ name: 'home' })" />
            <q-btn color="primary" label="Refresh" @click="refreshRemoteSafely" />
            <q-btn
              v-if="remoteGame?.status === 'lobby'"
              color="accent"
              label="Start spel"
              :disable="!isOwner || (remotePlayers.length < 2)"
              @click="onStartRemote"
            />
          </div>
        </q-card-section>
      </q-card>

      <div class="game-layout">
        <div class="layout-top">
          <div class="layout-players">
            <q-card
              v-for="player in displayPlayers"
              :key="player.id"
              flat
              bordered
              class="player-card"
              :class="`player-card--${player.seat_index % 4}`"
            >
              <q-card-section class="player-section">
                <div class="player-row-1">
                  <div class="player-avatar">
                    <img
                      v-if="player.avatar_url"
                      :src="player.avatar_url"
                      :alt="`Avatar ${player.display_name}`"
                      class="player-avatar-image"
                    />
                    <span v-else>{{ avatarText(player.display_name) }}</span>
                  </div>
                  <div class="player-name">{{ player.display_name }}</div>
                  <q-badge
                    v-if="remoteGame?.turn_player === player.player"
                    color="primary"
                    text-color="white"
                    label="Aan zet"
                  />
                  <div class="player-score-value">{{ player.score }}</div>
                </div>

                <div class="player-row-2">
                  <div class="word-row">
                  <div class="word-track">
                    <div v-for="(slot, index) in boardSlots(player)" :key="`${player.id}-${index}`" class="slot-cell">
                      <div
                        class="probe-slot"
                        :class="[
                          slot ? 'probe-slot--open' : 'probe-slot--closed',
                          `probe-slot--player-${player.seat_index % 4}`
                        ]"
                      >
                        <div class="probe-slot-top">{{ slot ? '' : (index + 1) }}</div>
                        <div class="probe-slot-char">{{ slotDisplay(slot) }}</div>
                        <div class="probe-slot-bottom">{{ slot ? slotValue(index) : '' }}</div>
                      </div>
                    </div>
                  </div>
                </div>

                  <div class="player-actions">
                    <q-btn
                      v-if="canSuperGuessOn(player)"
                      color="warning"
                      text-color="black"
                      icon="star"
                      square
                      size="md"
                      @click="openSuperGuessModal(player)"
                    />
                    <q-btn
                      v-if="canGuessOn(player)"
                      color="primary"
                      label="Gok"
                      @click="openGuessModal(player)"
                    />
                  </div>
                </div>
              </q-card-section>
            </q-card>
          </div>

          <q-card flat bordered class="chat-panel">
            <q-card-section class="chat-panel-section">
              <div class="text-h6">Hasperen</div>
              <div class="row q-col-gutter-sm q-mt-sm">
                <div class="col">
                  <q-input
                    v-model="chatDraft"
                    dense
                    maxlength="500"
                    label="Typ een bericht in Hasperen"
                    input-class="no-zoom-input"
                    @keyup.enter="onSendChat"
                  />
                </div>
                <div class="col-auto">
                  <q-btn color="primary" label="Verstuur" :disable="!canSendChat || !chatDraft.trim()" @click="onSendChat" />
                </div>
              </div>
              <div class="chat-list-wrap q-mt-sm">
                <q-list separator>
                  <q-item v-for="entry in sortedChatMessages" :key="entry.id" dense>
                    <q-item-section>
                      <q-item-label>
                        <strong>{{ entry.actor_name }}</strong>: {{ entry.message }}
                      </q-item-label>
                    </q-item-section>
                  </q-item>
                </q-list>
                <div v-if="!sortedChatMessages.length" class="text-caption text-grey-7">
                  Nog geen berichten.
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <q-card flat bordered class="game-log-panel">
          <q-card-section>
            <div class="text-h6">Game log</div>
            <div class="game-log-cards">
              <q-card v-for="entry in gameLogCardEntries" :key="entry.id" flat bordered class="game-log-card">
                <q-card-section class="row items-start no-wrap q-gutter-sm">
                  <q-icon :name="entry.icon" :color="entry.color" size="22px" />
                  <div class="text-body2">{{ entry.text }}</div>
                </q-card-section>
              </q-card>
            </div>
            <div v-if="!gameLogCardEntries.length" class="text-caption text-grey-7 q-mt-sm">
              Nog geen game log items.
            </div>
          </q-card-section>
        </q-card>
      </div>
    </div>

    <q-dialog v-model="guessDialogOpen" persistent>
      <q-card class="dialog-card">
        <q-card-section>
          <div class="text-h6">Vraag een letter</div>
          <div class="text-caption">
            Target: {{ pendingGuessTargetName || '-' }}
          </div>
        </q-card-section>
        <q-card-section>
          <div class="text-caption q-mb-sm">Kies 1 teken: A-Z of .</div>
          <div class="guess-char-grid">
            <q-btn
              v-for="char in guessCharOptions"
              :key="`guess-char-${char}`"
              dense
              square
              no-caps
              :label="char"
              :color="remoteGuessChar === char ? 'primary' : 'grey-3'"
              :text-color="remoteGuessChar === char ? 'white' : 'dark'"
              class="guess-char-btn"
              @click="remoteGuessChar = char"
            />
          </div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Annuleren" v-close-popup />
          <q-btn color="primary" label="Verstuur gok" @click="onSubmitGuess" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="superGuessDialogOpen" persistent>
      <q-card class="dialog-card">
        <q-card-section>
          <div class="text-h6">Supergok</div>
          <div class="text-caption">
            Raad het hele woord van: {{ pendingSuperTargetName || '-' }}
          </div>
        </q-card-section>
        <q-card-section>
          <q-input
            v-model="superGuessWord"
            label="Heel woord"
            hint="7-12 letters, zonder stippen"
            maxlength="12"
            input-class="no-zoom-input"
            autofocus
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Annuleren" v-close-popup />
          <q-btn color="warning" text-color="black" icon="star" label="Verstuur supergok" @click="onSubmitSuperGuess" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="finishedDialogOpen" persistent>
      <q-card class="dialog-card">
        <q-card-section>
          <div class="text-h6">Spel afgelopen</div>
          <div class="text-caption">Eindstand</div>
        </q-card-section>
        <q-card-section>
          <q-list separator>
            <q-item v-for="(player, index) in finalStandings" :key="`final-${player.id}`" dense>
              <q-item-section avatar>
                <q-badge color="primary" text-color="white" :label="String(index + 1)" />
              </q-item-section>
              <q-item-section>
                <q-item-label>{{ player.display_name }}</q-item-label>
              </q-item-section>
              <q-item-section side>
                <q-item-label>{{ player.score }} pt</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn color="primary" label="OK" @click="onAcknowledgeFinished" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="turnAlertDialogOpen" persistent>
      <q-card class="dialog-card">
        <q-card-section>
          <div class="text-h6">Aan zet</div>
          <div class="text-body2" style="white-space: pre-line">{{ turnAlertDialogText }}</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn color="primary" label="OK" @click="turnAlertDialogOpen = false" />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="finalPhaseDialogOpen" persistent>
      <q-card class="dialog-card">
        <q-card-section>
          <div class="text-h6">Eindfase</div>
          <div class="text-body2">{{ finalPhaseDialogText }}</div>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn color="primary" label="OK" @click="finalPhaseDialogOpen = false" />
        </q-card-actions>
      </q-card>
    </q-dialog>

  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionStore } from '@/stores/sessionStore';
import type { RemoteChatMessage, RemoteGame, RemoteGuess, RemotePlayer } from '@/services/gameSync';
import {
  getLatestFinalPhaseNotification,
  getLatestTurnNotification,
  getRemoteGame,
  listTurnStartNotifications,
  listRemoteChatMessages,
  listRemoteGuesses,
  listRemotePlayers,
  sendRemoteChatMessage,
  startRemoteGame,
  submitRemoteGuess,
  subscribeRemoteGame
} from '@/services/gameSync';
import VersionBanner from '@/components/VersionBanner.vue';
import { useSwUpdate } from '@/services/swUpdate';
import { settings } from '@/config/settings';

const route = useRoute();
const router = useRouter();
const $q = useQuasar();
const session = useSessionStore();
const { updateApp } = useSwUpdate();

const gameId = computed(() => String(route.params.gameId ?? ''));
const remoteGame = ref<RemoteGame | null>(null);
const remotePlayers = ref<RemotePlayer[]>([]);
const remoteGuesses = ref<RemoteGuess[]>([]);
const remoteChatMessages = ref<RemoteChatMessage[]>([]);
const remoteGuessChar = ref('');
const chatDraft = ref('');
const targetUserId = ref('');
const guessDialogOpen = ref(false);
const pendingGuessTargetName = ref('');
const superGuessDialogOpen = ref(false);
const superGuessWord = ref('');
const pendingSuperTargetUserId = ref('');
const pendingSuperTargetName = ref('');
const turnAlertDialogOpen = ref(false);
const turnAlertDialogText = ref('');
const finalPhaseDialogOpen = ref(false);
const finalPhaseDialogText = ref('');
const finishedDialogOpen = ref(false);
const finishedHandled = ref(false);
const remoteTurnNotifications = ref<Array<{ id: string; body: string; sent_at?: string }>>([]);
const lastTurnNotificationId = ref('');
const lastFinalPhaseNotificationId = ref('');

let stopSubscription: (() => void) | null = null;
let refreshInFlight = false;
let refreshQueued = false;

const isOwner = computed(() => remoteGame.value?.owner === session.userId);
const isMyTurn = computed(() => Boolean(session.userId) && remoteGame.value?.turn_player === session.userId);
const slotValues = Object.freeze([5, 10, 15, 15, 10, 5, 5, 10, 15, 15, 10, 5]);
const guessCharOptions = Object.freeze([
  'A', 'B', 'C', 'D', 'E', 'F', 'G',
  'H', 'I', 'J', 'K', 'L', 'M', 'N',
  'O', 'P', 'Q', 'R', 'S', 'T', 'U',
  'V', 'W', 'X', 'Y', 'Z', '.'
]);
const isCurrentUserInGame = computed(() =>
  Boolean(session.userId) && remotePlayers.value.some((player) => player.player === session.userId)
);
const canSendChat = computed(() =>
  Boolean(session.userId) &&
  isCurrentUserInGame.value &&
  remoteGame.value?.status !== 'finished'
);
const displayPlayers = computed(() => {
  if (!session.userId) return remotePlayers.value;
  const startIndex = remotePlayers.value.findIndex((player) => player.player === session.userId);
  if (startIndex < 0) return remotePlayers.value;
  return [
    ...remotePlayers.value.slice(startIndex),
    ...remotePlayers.value.slice(0, startIndex)
  ];
});
const sortedRemoteGuesses = computed(() =>
  [...remoteGuesses.value].sort((a, b) => {
    const aGuessAt = Date.parse(a.guess_at || '');
    const bGuessAt = Date.parse(b.guess_at || '');
    const aGuessAtValid = Number.isFinite(aGuessAt);
    const bGuessAtValid = Number.isFinite(bGuessAt);
    if (aGuessAtValid && bGuessAtValid && bGuessAt !== aGuessAt) return bGuessAt - aGuessAt;
    if (aGuessAtValid !== bGuessAtValid) return bGuessAtValid ? 1 : -1;

    const turnDiff = Number(b.turn_index ?? -1) - Number(a.turn_index ?? -1);
    if (turnDiff !== 0) return turnDiff;

    const aTime = Date.parse(a.created || '');
    const bTime = Date.parse(b.created || '');
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (aValid && bValid && bTime !== aTime) return bTime - aTime;
    if (aValid !== bValid) return bValid ? 1 : -1;

    return b.id.localeCompare(a.id);
  })
);
const sortedTurnNotifications = computed(() =>
  [...remoteTurnNotifications.value].sort((a, b) => {
    const aTime = Date.parse(a.sent_at || '');
    const bTime = Date.parse(b.sent_at || '');
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (aValid && bValid && bTime !== aTime) return bTime - aTime;
    if (aValid !== bValid) return bValid ? 1 : -1;
    return b.id.localeCompare(a.id);
  })
);
const gameLogEntries = computed(() => {
  const guessEntries = sortedRemoteGuesses.value.map((entry) => ({
    id: `guess-${entry.id}`,
    ts: Date.parse(entry.guess_at || entry.created || '') || 0,
    icon: entry.success ? 'check_circle' : 'cancel',
    color: entry.success ? 'positive' : 'negative',
    text: `${playerNameByUserId(entry.actor)} vroeg aan ${playerNameByUserId(entry.target_player)} naar ${guessText(entry)}`
  }));
  const turnEntries = sortedTurnNotifications.value.map((entry) => ({
    id: `turn-${entry.id}`,
    ts: Date.parse(entry.sent_at || '') || 0,
    icon: 'autorenew',
    color: 'primary',
    text: `Beurtwissel: ${entry.body || 'Activity card getrokken'}`
  }));
  return [...guessEntries, ...turnEntries].sort((a, b) => {
    if (b.ts !== a.ts) return b.ts - a.ts;
    return b.id.localeCompare(a.id);
  });
});
const gameLogCardEntries = computed(() => [...gameLogEntries.value]);
const sortedChatMessages = computed(() =>
  [...remoteChatMessages.value].sort((a, b) => {
    const aTime = Date.parse(a.message_at || '');
    const bTime = Date.parse(b.message_at || '');
    const aValid = Number.isFinite(aTime);
    const bValid = Number.isFinite(bTime);
    if (aValid && bValid && bTime !== aTime) return bTime - aTime;
    if (aValid !== bValid) return bValid ? 1 : -1;
    return b.id.localeCompare(a.id);
  })
);
const currentTurnPlayerName = computed(() => {
  const userId = remoteGame.value?.turn_player;
  if (!userId) return '-';
  return remotePlayers.value.find((player) => player.player === userId)?.display_name ?? shortId(userId);
});
const finalStandings = computed(() =>
  [...remotePlayers.value].sort((a, b) => {
    const scoreDiff = Number(b.score ?? 0) - Number(a.score ?? 0);
    if (scoreDiff !== 0) return scoreDiff;
    return Number(a.seat_index ?? 0) - Number(b.seat_index ?? 0);
  })
);

function errorMessage(error: unknown): string {
  const anyError = error as {
    response?: { message?: string; data?: Record<string, unknown> };
    message?: string;
  };
  const details = anyError?.response?.data ? ` ${JSON.stringify(anyError.response.data)}` : '';
  return `${anyError?.response?.message ?? anyError?.message ?? String(error)}${details}`;
}

function blurActiveInput(): void {
  const active = document.activeElement as HTMLElement | null;
  active?.blur();
}

async function refreshRemote(): Promise<void> {
  if (!gameId.value) return;

  remoteGame.value = await getRemoteGame(gameId.value);
  const [players, guesses, chat, latestTurnNotification, turnNotifications, latestFinalPhaseNotification] = await Promise.all([
    listRemotePlayers(gameId.value),
    listRemoteGuesses(gameId.value),
    listRemoteChatMessages(gameId.value).catch(() => []),
    getLatestTurnNotification(gameId.value).catch(() => null),
    listTurnStartNotifications(gameId.value).catch(() => []),
    getLatestFinalPhaseNotification(gameId.value).catch(() => null)
  ]);
  remotePlayers.value = players;
  remoteGuesses.value = guesses;
  remoteChatMessages.value = chat;
  remoteTurnNotifications.value = turnNotifications;
  maybeShowFinishedDialog();
  maybeShowActivityCardDialog(latestTurnNotification);
  maybeShowFinalPhaseDialog(latestFinalPhaseNotification);

  if (!targetUserId.value) {
    targetUserId.value = remotePlayers.value.find((player) => player.player !== session.userId)?.player ?? '';
  }
}

async function refreshRemoteSafely(): Promise<void> {
  if (refreshInFlight) {
    refreshQueued = true;
    return;
  }

  refreshInFlight = true;
  try {
    await refreshRemote();
  } catch (error) {
    console.error('refreshRemote failed', error);
  } finally {
    refreshInFlight = false;
    if (refreshQueued) {
      refreshQueued = false;
      void refreshRemoteSafely();
    }
  }
}

async function onSendChat(): Promise<void> {
  if (!remoteGame.value || !session.userId || !canSendChat.value) return;
  try {
    await sendRemoteChatMessage(remoteGame.value.id, session.userId, chatDraft.value);
    chatDraft.value = '';
    blurActiveInput();
  } catch (error) {
    $q.notify({ type: 'negative', message: `Chat versturen mislukt: ${errorMessage(error)}` });
  }
}

async function setupSubscription(): Promise<void> {
  if (!gameId.value) return;

  stopSubscription = await subscribeRemoteGame(gameId.value, () => {
    void refreshRemoteSafely();
  });
}

function onVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    void refreshRemoteSafely();
  }
}

async function onSubmitGuess(): Promise<void> {
  if (!remoteGame.value || !session.userId || !targetUserId.value || !remoteGuessChar.value.trim()) {
    return;
  }
  if (!isMyTurn.value) {
    $q.notify({ type: 'warning', message: 'Je bent nu niet aan de beurt' });
    return;
  }
  const guess = remoteGuessChar.value.trim().toUpperCase();
  if (!/^[A-Z.]$/.test(guess)) {
    $q.notify({ type: 'warning', message: 'Gebruik 1 teken: A-Z of .' });
    return;
  }

  try {
    await submitRemoteGuess(remoteGame.value.id, {
      actor: session.userId,
      target_player: targetUserId.value,
      guess_char: guess,
      is_interruptive: false
    });

    remoteGuessChar.value = '';
    guessDialogOpen.value = false;
    blurActiveInput();
  } catch (error) {
    $q.notify({ type: 'negative', message: `Gok versturen mislukt: ${errorMessage(error)}` });
  }
}

async function onSubmitSuperGuess(): Promise<void> {
  if (!remoteGame.value || !session.userId || !pendingSuperTargetUserId.value) {
    return;
  }
  const word = superGuessWord.value.trim().toUpperCase();
  if (!/^[A-Z]{7,12}$/.test(word)) {
    $q.notify({ type: 'warning', message: 'Supergok moet 7 t/m 12 letters bevatten (zonder stippen)' });
    return;
  }

  try {
    await submitRemoteGuess(remoteGame.value.id, {
      actor: session.userId,
      target_player: pendingSuperTargetUserId.value,
      guess_word: word,
      is_interruptive: true
    });
    superGuessDialogOpen.value = false;
    superGuessWord.value = '';
    pendingSuperTargetUserId.value = '';
    pendingSuperTargetName.value = '';
    blurActiveInput();
  } catch (error) {
    $q.notify({ type: 'negative', message: `Supergok versturen mislukt: ${errorMessage(error)}` });
  }
}

async function onStartRemote(): Promise<void> {
  if (!remoteGame.value) return;
  try {
    await startRemoteGame(remoteGame.value.id);
  } catch (error) {
    $q.notify({ type: 'negative', message: `Remote start mislukt: ${errorMessage(error)}` });
  }
}

function shortId(value: string): string {
  return value.slice(0, 6);
}

function avatarText(name: string): string {
  return (name || '?').trim().charAt(0).toUpperCase() || '?';
}

function playerNameByUserId(userId: string): string {
  return remotePlayers.value.find((player) => player.player === userId)?.display_name ?? shortId(userId);
}

function guessText(entry: RemoteGuess): string {
  if (entry.guess_char === '.') return 'een stip';
  if (entry.guess_char) return `een ${entry.guess_char}`;
  if (entry.guess_word) return `het woord ${entry.guess_word}`;
  return 'een teken';
}

function boardSlots(player: RemotePlayer): Array<string | null> {
  const slots = player.revealed_mask;
  if (slots.length >= 12) return slots.slice(0, 12);
  return [...slots, ...Array.from({ length: 12 - slots.length }, () => null)];
}

function slotDisplay(slot: string | null): string {
  if (!slot) return '';
  return slot === '.' ? '•' : slot;
}

function slotValue(index: number): number {
  return slotValues[index] ?? 0;
}

function canGuessOn(player: RemotePlayer): boolean {
  if (!session.userId || !remoteGame.value) return false;
  if (remoteGame.value.status !== 'active') return false;
  if (!isMyTurn.value) return false;
  if (player.is_word_revealed) return false;
  return player.player !== session.userId;
}

function canSuperGuessOn(player: RemotePlayer): boolean {
  if (!session.userId || !remoteGame.value) return false;
  if (remoteGame.value.status !== 'active') return false;
  if (!isCurrentUserInGame.value) return false;
  if (player.is_word_revealed) return false;
  if (Number(player.hidden_count ?? 0) < 5) return false;
  return player.player !== session.userId;
}

function openGuessModal(player: RemotePlayer): void {
  if (!canGuessOn(player)) return;
  targetUserId.value = player.player;
  pendingGuessTargetName.value = player.display_name;
  remoteGuessChar.value = '';
  guessDialogOpen.value = true;
}

function openSuperGuessModal(player: RemotePlayer): void {
  if (!canSuperGuessOn(player)) return;
  pendingSuperTargetUserId.value = player.player;
  pendingSuperTargetName.value = player.display_name;
  superGuessWord.value = '';
  superGuessDialogOpen.value = true;
}

function triggerUpdate(): void {
  void updateApp();
}

function maybeShowFinishedDialog(): void {
  if (!isCurrentUserInGame.value) return;
  if (remoteGame.value?.status !== 'finished') return;
  if (finishedHandled.value) return;

  guessDialogOpen.value = false;
  superGuessDialogOpen.value = false;
  finishedDialogOpen.value = true;
}

function maybeShowActivityCardDialog(notification: { id: string; body: string } | null): void {
  if (!session.userId || !isCurrentUserInGame.value || !notification) return;
  if (notification.id === lastTurnNotificationId.value) return;
  lastTurnNotificationId.value = notification.id;
  if (remoteGame.value?.turn_player !== session.userId) return;

  turnAlertDialogText.value = notification.body?.trim()
    ? `${notification.body}\n\nJij bent aan de beurt.`
    : 'Jij bent aan de beurt.';
  turnAlertDialogOpen.value = true;
}

function maybeShowFinalPhaseDialog(notification: { id: string; body: string } | null): void {
  if (!session.userId || !isCurrentUserInGame.value || !notification) return;
  if (notification.id === lastFinalPhaseNotificationId.value) return;
  lastFinalPhaseNotificationId.value = notification.id;
  finalPhaseDialogText.value = notification.body || 'Het einde nadert. Er is nog een woord niet geraden, iedereen krijgt nog maximaal 2 beurten.';
  finalPhaseDialogOpen.value = true;
}

function onAcknowledgeFinished(): void {
  finishedDialogOpen.value = false;
  finishedHandled.value = true;
  router.push({ name: 'home' });
}

onMounted(async () => {
  await refreshRemoteSafely();
  if (settings.realtimeEnabled) {
    await setupSubscription();
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
});

onUnmounted(() => {
  if (stopSubscription) {
    stopSubscription();
    stopSubscription = null;
  }
  document.removeEventListener('visibilitychange', onVisibilityChange);
});
</script>

<style scoped>
.player-card--0 {
  border-left: 8px solid #1e88e5;
}

.player-card--1 {
  border-left: 8px solid #43a047;
}

.player-card--2 {
  border-left: 8px solid #fb8c00;
}

.player-card--3 {
  border-left: 8px solid #e53935;
}

.player-card {
  overflow: hidden;
}

.game-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.layout-top,
.layout-players {
  min-width: 0;
}

.layout-top {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.chat-panel {
  min-width: 0;
}

.chat-panel-section {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.game-log-panel {
  min-width: 0;
}

.game-log-cards {
  display: flex;
  flex-direction: row;
  align-items: stretch;
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 4px;
}

.game-log-card {
  min-width: 260px;
  max-width: 320px;
  flex: 0 0 auto;
}

.player-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.player-row-1 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.player-avatar {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  background: #f2f2f2;
  border: 1px solid #d5d5d5;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 17px;
  color: #404040;
  flex-shrink: 0;
  overflow: hidden;
}

.player-avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.player-name {
  font-weight: 600;
}

.player-score-value {
  margin-left: auto;
  font-size: 20px;
  font-weight: 700;
}

.player-row-2 {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.word-row {
  flex: 1;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}

.word-track {
  display: flex;
  flex-wrap: nowrap;
  gap: 6px;
  min-width: max-content;
}

.slot-cell {
  width: 28px;
  min-width: 28px;
  max-width: 28px;
  flex: 0 0 28px;
}

.probe-slot {
  width: 28px;
  height: 40px;
  border-radius: 4px;
  border: 1px solid transparent;
  position: relative;
  display: block;
  padding: 0;
  box-sizing: border-box;
}

.probe-slot-top,
.probe-slot-bottom {
  font-size: 9px;
  line-height: 1;
  position: absolute;
  left: 0;
  width: 100%;
  text-align: center;
}

.probe-slot-top {
  top: 1px;
}

.probe-slot-bottom {
  bottom: 1px;
}

.probe-slot-char {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  line-height: 1;
}

.probe-slot--closed {
  color: rgba(255, 255, 255, 0.96);
}

.probe-slot--open {
  background: #ffffff;
  color: #111;
  border-color: rgba(0, 0, 0, 0.15);
}

.probe-slot--player-0.probe-slot--closed {
  background: #1e88e5;
}

.probe-slot--player-1.probe-slot--closed {
  background: #43a047;
}

.probe-slot--player-2.probe-slot--closed {
  background: #fb8c00;
}

.probe-slot--player-3.probe-slot--closed {
  background: #e53935;
}

.player-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  min-height: 40px;
  min-width: 132px;
  justify-content: flex-end;
}

:deep(.no-zoom-input) {
  font-size: 16px;
}

.dialog-card {
  width: min(92vw, 520px);
}

.guess-char-grid {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 6px;
}

.guess-char-btn {
  min-height: 34px;
}

.chat-list-wrap {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

@media (max-width: 430px) {
  .word-track {
    gap: 4px;
  }

  .player-avatar {
    width: 38px;
    height: 38px;
    font-size: 15px;
  }

  .player-name {
    font-size: 14px;
  }

  .player-score-value {
    font-size: 18px;
  }

  .player-row-2 {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
    width: 100%;
  }

  .player-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .slot-cell {
    width: 22px;
    min-width: 22px;
    max-width: 22px;
    flex-basis: 22px;
  }

  .guess-char-grid {
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }

  .probe-slot {
    width: 22px;
    height: 34px;
  }

  .probe-slot-char {
    font-size: 11px;
  }

  .probe-slot-top,
  .probe-slot-bottom {
    font-size: 8px;
  }
}

@media (min-width: 768px) {
  .layout-top {
    display: grid;
    grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr);
    align-items: stretch;
  }

  .layout-players {
    height: 480px;
    max-height: 480px;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .player-card {
    height: calc((480px - 18px) / 4);
    min-height: calc((480px - 18px) / 4);
    max-height: calc((480px - 18px) / 4);
    margin: 0;
  }

  .player-card :deep(.q-card__section) {
    padding: 10px 12px;
  }

  .chat-panel {
    height: 480px;
    max-height: 480px;
  }
}
</style>
