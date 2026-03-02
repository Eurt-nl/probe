<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="text-h6">Scorebord</div>
      <q-list bordered separator class="rounded-borders q-mt-sm">
        <q-item v-for="player in players" :key="player.id">
          <q-item-section>
            <q-item-label>{{ player.name }}</q-item-label>
            <q-item-label caption>
              Verborgen: {{ hiddenCount(player) }}
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
      <div class="text-h6">Bordweergave</div>
      <div v-for="player in players" :key="`${player.id}-board`" class="q-mt-sm">
        <div class="text-subtitle2">{{ player.name }}</div>
        <div class="row q-col-gutter-xs q-mt-xs">
          <div v-for="slot in player.slots" :key="slot.index" class="col-auto">
            <q-chip
              square
              dense
              :color="slot.revealed ? 'positive' : 'grey-4'"
              :text-color="slot.revealed ? 'white' : 'grey-8'"
              class="slot-chip"
            >
              {{ slot.revealed ? slot.char : '?' }} ({{ slot.points }})
            </q-chip>
          </div>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import type { PlayerState } from '@/types/game';

defineProps<{
  players: PlayerState[];
}>();

function hiddenCount(player: PlayerState): number {
  return player.slots.filter((slot) => !slot.revealed).length;
}
</script>
