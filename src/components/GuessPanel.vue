<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="text-h6">Beurt: {{ activePlayerName }}</div>
      <div class="row q-col-gutter-md q-mt-sm">
        <div class="col-12 col-md-5">
          <q-select
            v-model="targetPlayerId"
            :options="targetOptions"
            emit-value
            map-options
            label="Kies tegenstander"
          />
        </div>
        <div class="col-12 col-md-3">
          <q-input
            v-model="guess"
            maxlength="1"
            label="Letter of dot"
            hint="Gebruik . voor dot"
          />
        </div>
        <div class="col-12 col-md-4 flex items-end">
          <q-btn color="primary" label="Doe gok" unelevated @click="emitGuess" />
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue';
import type { PlayerState } from '@/types/game';

const props = defineProps<{
  activePlayerId: string;
  players: PlayerState[];
}>();

const emit = defineEmits<{
  guess: [targetPlayerId: string, guess: string];
}>();

const guess = ref('');
const targetPlayerId = ref('');

const targetOptions = computed(() =>
  props.players
    .filter((player) => player.id !== props.activePlayerId)
    .map((player) => ({ label: player.name, value: player.id }))
);

const activePlayerName = computed(() => props.players.find((p) => p.id === props.activePlayerId)?.name ?? '-');

watchEffect(() => {
  if (!targetPlayerId.value && targetOptions.value.length) {
    targetPlayerId.value = targetOptions.value[0].value;
  }
});

function emitGuess(): void {
  if (!targetPlayerId.value || !guess.value) return;
  emit('guess', targetPlayerId.value, guess.value[0]);
  guess.value = '';
}
</script>
