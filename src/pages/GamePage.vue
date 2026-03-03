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

      <q-card
        v-for="player in remotePlayers"
        :key="player.id"
        flat
        bordered
        class="q-mb-sm player-card"
        :class="`player-card--${player.seat_index % 4}`"
      >
        <q-card-section class="row items-center no-wrap">
          <div class="player-score q-mr-md">
            <div class="text-caption">Score</div>
            <div class="text-h6">{{ player.score }}</div>
          </div>

          <div class="col">
            <div class="row items-center q-gutter-sm">
              <div class="text-subtitle1">{{ player.display_name }}</div>
              <q-badge
                v-if="remoteGame?.turn_player === player.player"
                color="primary"
                text-color="white"
                label="Aan de beurt"
              />
            </div>

            <div class="row q-col-gutter-xs q-mt-sm">
              <div v-for="(slot, index) in boardSlots(player)" :key="`${player.id}-${index}`" class="col-auto">
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

          <q-btn
            v-if="canGuessOn(player)"
            class="q-ml-md"
            color="primary"
            label="Gok"
            @click="openGuessModal(player)"
          />
        </q-card-section>
      </q-card>

      <q-card flat bordered class="q-mt-md">
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
    </div>

    <q-dialog v-model="guessDialogOpen" persistent>
      <q-card style="min-width: 360px">
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
            autofocus
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Annuleren" v-close-popup />
          <q-btn color="primary" label="Verstuur gok" @click="onSubmitGuess" />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionStore } from '@/stores/sessionStore';
import type { RemoteGame, RemoteGuess, RemotePlayer } from '@/services/gameSync';
import {
  getRemoteGame,
  listRemoteGuesses,
  listRemotePlayers,
  startRemoteGame,
  submitRemoteGuess,
  subscribeRemoteGame
} from '@/services/gameSync';
import VersionBanner from '@/components/VersionBanner.vue';
import { useSwUpdate } from '@/services/swUpdate';

const route = useRoute();
const $q = useQuasar();
const session = useSessionStore();
const { updateApp } = useSwUpdate();

const gameId = computed(() => String(route.params.gameId ?? ''));
const remoteGame = ref<RemoteGame | null>(null);
const remotePlayers = ref<RemotePlayer[]>([]);
const remoteGuesses = ref<RemoteGuess[]>([]);
const remoteGuessChar = ref('');
const targetUserId = ref('');
const guessDialogOpen = ref(false);
const pendingGuessTargetName = ref('');
const guessLogPage = ref(1);
const guessLogPerPage = 2;

let stopSubscription: (() => void) | null = null;

const isOwner = computed(() => remoteGame.value?.owner === session.userId);
const isMyTurn = computed(() => Boolean(session.userId) && remoteGame.value?.turn_player === session.userId);
const sortedRemoteGuesses = computed(() =>
  [...remoteGuesses.value].sort((a, b) => {
    const aKey = a.created || a.id;
    const bKey = b.created || b.id;
    return bKey.localeCompare(aKey);
  })
);
const guessLogTotalPages = computed(() => Math.max(1, Math.ceil(sortedRemoteGuesses.value.length / guessLogPerPage)));
const pagedRemoteGuesses = computed(() => {
  const start = (guessLogPage.value - 1) * guessLogPerPage;
  return sortedRemoteGuesses.value.slice(start, start + guessLogPerPage);
});
const currentTurnPlayerName = computed(() => {
  const userId = remoteGame.value?.turn_player;
  if (!userId) return '-';
  return remotePlayers.value.find((player) => player.player === userId)?.display_name ?? shortId(userId);
});

function errorMessage(error: unknown): string {
  const anyError = error as {
    response?: { message?: string; data?: Record<string, unknown> };
    message?: string;
  };
  const details = anyError?.response?.data ? ` ${JSON.stringify(anyError.response.data)}` : '';
  return `${anyError?.response?.message ?? anyError?.message ?? String(error)}${details}`;
}

async function refreshRemote(): Promise<void> {
  if (!gameId.value) return;

  remoteGame.value = await getRemoteGame(gameId.value);
  remotePlayers.value = await listRemotePlayers(gameId.value);
  remoteGuesses.value = await listRemoteGuesses(gameId.value);

  if (!targetUserId.value) {
    targetUserId.value = remotePlayers.value.find((player) => player.player !== session.userId)?.player ?? '';
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
      guess_char: guess
    });

    remoteGuessChar.value = '';
    guessDialogOpen.value = false;
  } catch (error) {
    $q.notify({ type: 'negative', message: `Gok versturen mislukt: ${errorMessage(error)}` });
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

function openGuessModal(player: RemotePlayer): void {
  if (!canGuessOn(player)) return;
  targetUserId.value = player.player;
  pendingGuessTargetName.value = player.display_name;
  remoteGuessChar.value = '';
  guessDialogOpen.value = true;
}

function triggerUpdate(): void {
  void updateApp();
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

.player-score {
  min-width: 78px;
}

.slot-chip {
  min-width: 28px;
  justify-content: center;
  font-weight: 600;
}
</style>
