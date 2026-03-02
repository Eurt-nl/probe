<template>
  <q-page class="page-wrap">
    <div class="container q-pa-md">
      <VersionBanner :on-update="triggerUpdate" />

      <q-card flat bordered class="q-mb-md">
        <q-card-section>
          <div class="text-h5">Probe PWA</div>
          <div class="text-body2 text-grey-8">Start een lokaal spel en synchroniseer desgewenst via PocketBase.</div>
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
            <q-btn color="primary" label="Nieuw spel" unelevated @click="createGame" />
          </div>
        </q-card-section>
      </q-card>

      <q-card flat bordered class="q-mb-md" v-if="game">
        <q-card-section>
          <div class="text-h6">Spelers toevoegen</div>
          <div class="row q-col-gutter-md q-mt-sm">
            <div class="col-12 col-md-4">
              <q-input v-model="newPlayerName" label="Naam speler" />
            </div>
            <div class="col-12 col-md-4">
              <q-input v-model="newPlayerSecret" label="Geheime woord" maxlength="12" />
            </div>
            <div class="col-12 col-md-4 flex items-end">
              <q-btn color="secondary" label="Speler toevoegen" @click="addPlayer" />
            </div>
          </div>
        </q-card-section>
      </q-card>

      <q-card flat bordered v-if="game">
        <q-card-section class="row items-center justify-between">
          <div>
            <div class="text-subtitle1">Game ID</div>
            <div class="text-caption">{{ game.id }}</div>
          </div>
          <div class="row q-gutter-sm">
            <q-btn color="accent" label="Start spel" :disable="game.players.length < 2" @click="startGame" />
            <q-btn color="primary" outline label="Open spel" @click="openGame" />
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
import { useGameStore } from '@/stores/gameStore';
import VersionBanner from '@/components/VersionBanner.vue';
import AppVersionPanel from '@/components/AppVersionPanel.vue';
import { useSwUpdate } from '@/services/swUpdate';

const router = useRouter();
const gameStore = useGameStore();
const { updateApp } = useSwUpdate();

const ownerName = ref('');
const ownerSecret = ref('');
const newPlayerName = ref('');
const newPlayerSecret = ref('');

const game = computed(() => gameStore.game);

function createGame(): void {
  if (!ownerName.value.trim() || !ownerSecret.value.trim()) return;
  gameStore.createGame(ownerName.value.trim(), ownerSecret.value.trim());
}

function addPlayer(): void {
  if (!newPlayerName.value.trim() || !newPlayerSecret.value.trim()) return;
  gameStore.addPlayer(newPlayerName.value.trim(), newPlayerSecret.value.trim());
  newPlayerName.value = '';
  newPlayerSecret.value = '';
}

function startGame(): void {
  gameStore.startGame();
  openGame();
}

function openGame(): void {
  if (!gameStore.game) return;
  router.push({ name: 'game', params: { gameId: gameStore.game.id } });
}

function triggerUpdate(): void {
  void updateApp();
}
</script>
