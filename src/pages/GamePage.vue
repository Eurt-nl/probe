<template>
  <q-page class="page-wrap">
    <div class="container q-pa-md">
      <VersionBanner :on-update="triggerUpdate" />

      <q-card flat bordered class="q-mb-md">
        <q-card-section class="row items-center justify-between">
          <div>
            <div class="text-h6">Remote game: {{ gameId }}</div>
            <div class="text-caption">Status: {{ remoteGame?.status ?? '-' }} | Turn player ID: {{ remoteGame?.turn_player ?? '-' }}</div>
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

      <div class="row q-col-gutter-md">
        <div class="col-12 col-lg-4">
          <q-card flat bordered>
            <q-card-section>
              <div class="text-h6">Spelers</div>
              <q-list separator>
                <q-item v-for="player in remotePlayers" :key="player.id">
                  <q-item-section>
                    <q-item-label>{{ player.display_name }}</q-item-label>
                    <q-item-label caption>
                      Verborgen: {{ player.hidden_count }} | playerId: {{ player.player }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-badge color="secondary" :label="String(player.score)" />
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card-section>
          </q-card>

          <q-card flat bordered class="q-mt-md">
            <q-card-section>
              <div class="text-subtitle1">Beurt doorgeven (fallback)</div>
              <q-select
                v-model="nextTurnUserId"
                class="q-mt-sm"
                :options="remotePlayers.map((p) => ({ label: p.display_name, value: p.player }))"
                emit-value
                map-options
                label="Volgende speler"
              />
              <q-btn class="q-mt-sm" color="primary" label="Zet beurt" @click="onAdvanceTurn" />
            </q-card-section>
          </q-card>
        </div>

        <div class="col-12 col-lg-8">
          <q-card flat bordered>
            <q-card-section>
              <div class="text-h6">Gok letter of dot (server-side validatie)</div>
              <div class="text-caption text-grey-8">Maak een gok; PocketBase referee verwerkt score, reveal en beurtwissel.</div>

              <div class="row q-col-gutter-md q-mt-sm">
                <div class="col-12 col-md-6">
                  <q-select
                    v-model="targetUserId"
                    :options="remotePlayers.filter((p) => p.player !== session.userId).map((p) => ({ label: p.display_name, value: p.player }))"
                    emit-value
                    map-options
                    label="Target speler"
                  />
                </div>
                <div class="col-12 col-md-3">
                  <q-input v-model="remoteGuessChar" label="Letter/dot" maxlength="1" hint="Gebruik . voor dot" />
                </div>
                <div class="col-12 col-md-3 flex items-end">
                  <q-btn color="primary" label="Verstuur gok" @click="onSubmitGuess" />
                </div>
              </div>
            </q-card-section>
          </q-card>

          <q-card flat bordered class="q-mt-md">
            <q-card-section>
              <div class="text-h6">Remote Guess log</div>
              <q-list separator>
                <q-item v-for="entry in remoteGuesses" :key="entry.id">
                  <q-item-section>
                    <q-item-label>{{ entry.reason ?? 'Guess event' }}</q-item-label>
                    <q-item-label caption>
                      actor: {{ shortId(entry.actor) }} -> target: {{ shortId(entry.target_player) }} •
                      {{ entry.guess_char ?? entry.guess_word ?? '-' }} • {{ entry.points_delta }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-chip dense :color="entry.success ? 'positive' : 'negative'" text-color="white">
                      {{ entry.success ? 'Success' : 'Fail' }}
                    </q-chip>
                  </q-item-section>
                </q-item>
              </q-list>
            </q-card-section>
          </q-card>
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useQuasar } from 'quasar';
import { useSessionStore } from '@/stores/sessionStore';
import type { RemoteGame, RemoteGuess, RemotePlayer } from '@/services/gameSync';
import {
  advanceTurn,
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
const nextTurnUserId = ref('');

let stopSubscription: (() => void) | null = null;

const isOwner = computed(() => remoteGame.value?.owner === session.userId);

async function refreshRemote(): Promise<void> {
  if (!gameId.value) return;

  remoteGame.value = await getRemoteGame(gameId.value);
  remotePlayers.value = await listRemotePlayers(gameId.value);
  remoteGuesses.value = await listRemoteGuesses(gameId.value);

  if (!targetUserId.value) {
    targetUserId.value = remotePlayers.value.find((player) => player.player !== session.userId)?.player ?? '';
  }
  if (!nextTurnUserId.value) {
    nextTurnUserId.value = remotePlayers.value[0]?.player ?? '';
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

  try {
    await submitRemoteGuess(remoteGame.value.id, {
      actor: session.userId,
      target_player: targetUserId.value,
      guess_char: remoteGuessChar.value
    });

    remoteGuessChar.value = '';
  } catch (error) {
    $q.notify({ type: 'negative', message: `Gok versturen mislukt: ${String(error)}` });
  }
}

async function onAdvanceTurn(): Promise<void> {
  if (!remoteGame.value || !nextTurnUserId.value) return;
  try {
    await advanceTurn(remoteGame.value.id, nextTurnUserId.value);
  } catch (error) {
    $q.notify({ type: 'negative', message: `Beurt wijzigen mislukt: ${String(error)}` });
  }
}

async function onStartRemote(): Promise<void> {
  if (!remoteGame.value) return;
  try {
    await startRemoteGame(remoteGame.value.id);
  } catch (error) {
    $q.notify({ type: 'negative', message: `Remote start mislukt: ${String(error)}` });
  }
}

function shortId(value: string): string {
  return value.slice(0, 6);
}

function triggerUpdate(): void {
  void updateApp();
}

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
