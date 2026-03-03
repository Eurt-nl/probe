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
            <q-btn color="primary" label="Refresh" @click="refreshRemote" />
            <q-btn
              color="accent"
              label="Start remote spel"
              :disable="!isOwner || (remotePlayers.length < 2)"
              @click="onStartRemote"
            />
          </div>
        </q-card-section>
      </q-card>

      <div class="game-layout">
        <div class="layout-left">
          <q-card
            v-for="player in displayPlayers"
            :key="player.id"
            flat
            bordered
            class="q-mb-sm player-card"
            :class="`player-card--${player.seat_index % 4}`"
          >
            <q-card-section class="player-section">
              <div class="player-row-1">
                <div class="player-avatar">
                  {{ avatarText(player.display_name) }}
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
                      <q-chip
                        square
                        dense
                        :color="slot ? 'white' : 'grey-3'"
                        :text-color="slot ? 'dark' : 'grey-7'"
                        class="slot-chip"
                      >
                        {{ slot ?? '•' }}
                      </q-chip>
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

        <div class="layout-right">
          <q-card flat bordered class="q-mb-md">
            <q-card-section>
              <div class="text-h6">Remote Guess log</div>
              <q-list separator>
                <q-item v-for="entry in pagedRemoteGuesses" :key="entry.id" dense>
                  <q-item-section avatar>
                    <q-icon :name="entry.success ? 'check_circle' : 'cancel'" :color="entry.success ? 'positive' : 'negative'" />
                  </q-item-section>
                  <q-item-section>
                    <q-item-label>
                      {{ playerNameByUserId(entry.actor) }} vroeg aan {{ playerNameByUserId(entry.target_player) }} naar {{ guessText(entry) }}
                    </q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
              <div class="row justify-center q-mt-sm" v-if="guessLogTotalPages > 1">
                <q-pagination v-model="guessLogPage" :max="guessLogTotalPages" :max-pages="6" direction-links />
              </div>
            </q-card-section>
          </q-card>

          <q-card flat bordered>
            <q-card-section>
              <div class="text-h6">Spelchat</div>
              <q-list separator>
                <q-item v-for="entry in sortedChatMessages" :key="entry.id" dense>
                  <q-item-section>
                    <q-item-label>
                      <strong>{{ entry.actor_name }}</strong>: {{ entry.message }}
                    </q-item-label>
                    <q-item-label caption>{{ formatDateTime(entry.message_at) }}</q-item-label>
                  </q-item-section>
                </q-item>
              </q-list>
              <div v-if="!sortedChatMessages.length" class="text-caption text-grey-7 q-mt-sm">
                Nog geen chatberichten.
              </div>
              <div class="row q-col-gutter-sm q-mt-sm">
                <div class="col">
                  <q-input
                    v-model="chatDraft"
                    dense
                    maxlength="500"
                    label="Typ een bericht"
                    input-class="no-zoom-input"
                    @keyup.enter="onSendChat"
                  />
                </div>
                <div class="col-auto">
                  <q-btn color="primary" label="Verstuur" :disable="!canSendChat || !chatDraft.trim()" @click="onSendChat" />
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>
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
          <q-input
            v-model="remoteGuessChar"
            label="Letter of dot"
            hint="1 teken: A-Z of ."
            maxlength="1"
            input-class="no-zoom-input"
            autofocus
          />
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
            hint="8-12 letters, zonder stippen"
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

    <q-dialog v-model="activityCardDialogOpen" :persistent="activityCardRequiresAck">
      <q-card class="dialog-card">
        <q-card-section>
          <div class="text-h6">Activity card</div>
          <div class="text-body2">{{ activityCardDialogText }}</div>
        </q-card-section>
        <q-card-actions align="right" v-if="activityCardRequiresAck">
          <q-btn color="primary" label="OK" @click="closeActivityCardDialog" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionStore } from '@/stores/sessionStore';
import type { RemoteChatMessage, RemoteGame, RemoteGuess, RemotePlayer, RemoteTurn } from '@/services/gameSync';
import {
  getActiveRemoteTurn,
  getRemoteGame,
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
const finishedDialogOpen = ref(false);
const finishedHandled = ref(false);
const activityCardDialogOpen = ref(false);
const activityCardDialogText = ref('');
const activityCardRequiresAck = ref(false);
const guessLogPage = ref(1);
const guessLogPerPage = 2;
const previousTurnRecordId = ref('');
const turnRecordWatcherInitialized = ref(false);

let stopSubscription: (() => void) | null = null;
let activityDialogTimer: ReturnType<typeof setTimeout> | null = null;

const isOwner = computed(() => remoteGame.value?.owner === session.userId);
const isMyTurn = computed(() => Boolean(session.userId) && remoteGame.value?.turn_player === session.userId);
const isCurrentUserInGame = computed(() =>
  Boolean(session.userId) && remotePlayers.value.some((player) => player.player === session.userId)
);
const canSendChat = computed(() =>
  Boolean(session.userId) &&
  isCurrentUserInGame.value &&
  remoteGame.value?.status === 'active'
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
const guessLogTotalPages = computed(() => Math.max(1, Math.ceil(sortedRemoteGuesses.value.length / guessLogPerPage)));
const pagedRemoteGuesses = computed(() => {
  const start = (guessLogPage.value - 1) * guessLogPerPage;
  return sortedRemoteGuesses.value.slice(start, start + guessLogPerPage);
});
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
  const [players, guesses, chat, activeTurn] = await Promise.all([
    listRemotePlayers(gameId.value),
    listRemoteGuesses(gameId.value),
    listRemoteChatMessages(gameId.value).catch(() => []),
    getActiveRemoteTurn(gameId.value).catch(() => null)
  ]);
  remotePlayers.value = players;
  remoteGuesses.value = guesses;
  remoteChatMessages.value = chat;
  maybeShowFinishedDialog();
  maybeShowActivityCardDialog(activeTurn);

  if (!targetUserId.value) {
    targetUserId.value = remotePlayers.value.find((player) => player.player !== session.userId)?.player ?? '';
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
    void refreshRemote();
  });
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
  if (!/^[A-Z]{8,12}$/.test(word)) {
    $q.notify({ type: 'warning', message: 'Supergok moet 8 t/m 12 letters bevatten (zonder stippen)' });
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

function canGuessOn(player: RemotePlayer): boolean {
  if (!session.userId || !remoteGame.value) return false;
  if (remoteGame.value.status !== 'active') return false;
  if (!isMyTurn.value) return false;
  return player.player !== session.userId;
}

function canSuperGuessOn(player: RemotePlayer): boolean {
  if (!session.userId || !remoteGame.value) return false;
  if (remoteGame.value.status !== 'active') return false;
  if (!isCurrentUserInGame.value) return false;
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

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getFullYear());
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
}

function maybeShowFinishedDialog(): void {
  if (!isCurrentUserInGame.value) return;
  if (remoteGame.value?.status !== 'finished') return;
  if (finishedHandled.value) return;

  guessDialogOpen.value = false;
  superGuessDialogOpen.value = false;
  finishedDialogOpen.value = true;
}

function closeActivityCardDialog(): void {
  activityCardDialogOpen.value = false;
  if (activityDialogTimer) {
    clearTimeout(activityDialogTimer);
    activityDialogTimer = null;
  }
}

function maybeShowActivityCardDialog(activeTurn: RemoteTurn | null): void {
  if (!session.userId || !isCurrentUserInGame.value || !activeTurn) return;

  if (!turnRecordWatcherInitialized.value) {
    previousTurnRecordId.value = activeTurn.id;
    turnRecordWatcherInitialized.value = true;
    return;
  }

  if (activeTurn.id === previousTurnRecordId.value) return;
  previousTurnRecordId.value = activeTurn.id;

  const cardLabel = activeTurn.activity_card_label ?? 'Geen kaart';
  activityCardDialogText.value = `${activeTurn.player_name} trok: ${cardLabel}`;

  const isMyTurnNow = activeTurn.player === session.userId;
  activityCardRequiresAck.value = isMyTurnNow;
  activityCardDialogOpen.value = true;

  if (activityDialogTimer) {
    clearTimeout(activityDialogTimer);
    activityDialogTimer = null;
  }
  if (!isMyTurnNow) {
    activityDialogTimer = setTimeout(() => {
      activityCardDialogOpen.value = false;
      activityDialogTimer = null;
    }, 2500);
  }
}

function onAcknowledgeFinished(): void {
  finishedDialogOpen.value = false;
  finishedHandled.value = true;
  router.push({ name: 'home' });
}

watch(guessLogTotalPages, (totalPages) => {
  if (guessLogPage.value > totalPages) {
    guessLogPage.value = totalPages;
  }
});

onMounted(async () => {
  await refreshRemote();
  await setupSubscription();
});

onUnmounted(() => {
  if (stopSubscription) {
    stopSubscription();
    stopSubscription = null;
  }
  if (activityDialogTimer) {
    clearTimeout(activityDialogTimer);
    activityDialogTimer = null;
  }
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

.game-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.layout-left,
.layout-right {
  min-width: 0;
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
}

.word-row {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
}

.word-track {
  display: flex;
  flex-wrap: nowrap;
  gap: 4px;
  min-width: max-content;
}

.slot-chip {
  min-width: 28px;
  justify-content: center;
  font-weight: 600;
  margin: 0;
}

.player-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

:deep(.no-zoom-input) {
  font-size: 16px;
}

.dialog-card {
  width: min(92vw, 520px);
}

@media (max-width: 430px) {
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
  }

  .player-actions {
    width: 100%;
    justify-content: flex-end;
  }

  .slot-chip {
    min-width: 22px;
    font-size: 12px;
  }
}

@media (min-width: 768px) {
  .game-layout {
    flex-direction: row;
    align-items: flex-start;
  }

  .layout-left {
    width: 60%;
  }

  .layout-right {
    width: 40%;
  }
}
</style>
