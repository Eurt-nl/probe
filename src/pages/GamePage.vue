<template>
  <q-page class="page-wrap">
    <div class="container q-pa-md" v-if="game">
      <VersionBanner :on-update="triggerUpdate" />

      <div class="row q-col-gutter-md">
        <div class="col-12 col-lg-8">
          <ActivityCardPanel :active-card="activeCard" @draw="drawCard" />
          <GuessPanel
            class="q-mt-md"
            :active-player-id="game.turnPlayerId"
            :players="game.players"
            @guess="handleGuess"
          />
          <GuessLog class="q-mt-md" :events="gameStore.guessLog" />
        </div>
        <div class="col-12 col-lg-4">
          <GameBoard :players="game.players" />
        </div>
      </div>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuasar } from 'quasar';
import { useGameStore } from '@/stores/gameStore';
import type { ActivityCard } from '@/types/game';
import ActivityCardPanel from '@/components/ActivityCardPanel.vue';
import GameBoard from '@/components/GameBoard.vue';
import GuessPanel from '@/components/GuessPanel.vue';
import GuessLog from '@/components/GuessLog.vue';
import VersionBanner from '@/components/VersionBanner.vue';
import { useSwUpdate } from '@/services/swUpdate';

const $q = useQuasar();
const gameStore = useGameStore();
const { updateApp } = useSwUpdate();

const deck: ActivityCard[] = [
  { id: '1', type: 'NORMAL_TURN', label: 'Take your normal turn' },
  { id: '2', type: 'ADDITIONAL_TURN', label: 'Take an additional turn' },
  { id: '3', type: 'LEFT_EXPOSES', label: 'Opponent on your left exposes one slot' },
  { id: '4', type: 'RIGHT_EXPOSES', label: 'Opponent on your right exposes one slot' },
  { id: '5', type: 'EXPOSE_OWN_DOT', label: 'If you have a dot, expose it' },
  { id: '6', type: 'MULTIPLY_FIRST_GUESS', value: 3, label: 'Triple value of your first guess' },
  { id: '7', type: 'MULTIPLY_FIRST_GUESS', value: 4, label: 'Quadruple value of your first guess' },
  { id: '8', type: 'MULTIPLY_FIRST_GUESS', value: 5, label: 'Quintuple value of your first guess' },
  { id: '9', type: 'ADD_SCORE', value: 25, label: 'Add +25 to your score' },
  { id: '10', type: 'DEDUCT_SCORE', value: -25, label: 'Deduct -25 from your score' }
];

const activeCard = ref<ActivityCard | null>(null);
const game = computed(() => gameStore.game);

function drawCard(): void {
  if (!game.value) return;
  const card = deck[Math.floor(Math.random() * deck.length)];
  activeCard.value = card;

  const currentPlayerId = game.value.turnPlayerId;

  // Card effects are applied immediately when drawing, aligned with board game flow.
  switch (card.type) {
    case 'MULTIPLY_FIRST_GUESS':
      gameStore.setTurnMultiplier(card.value ?? 1);
      break;
    case 'ADD_SCORE':
    case 'DEDUCT_SCORE':
      gameStore.applyScoreAdjustment(currentPlayerId, card.value ?? 0, card.label);
      break;
    default:
      break;
  }
}

function handleGuess(targetPlayerId: string, guess: string): void {
  if (!game.value) return;

  const success = gameStore.applyGuess(game.value.turnPlayerId, targetPlayerId, guess);

  $q.notify({
    type: success ? 'positive' : 'negative',
    message: success ? `Correcte gok: ${guess.toUpperCase()}` : `Mis: ${guess.toUpperCase()}`
  });
}

function triggerUpdate(): void {
  void updateApp();
}
</script>
