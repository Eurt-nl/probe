<template>
  <q-card flat bordered>
    <q-card-section>
      <div class="text-h6">Actielog</div>
      <q-list separator>
        <q-item v-for="event in events" :key="event.id">
          <q-item-section>
            <q-item-label>{{ event.note ?? 'Actie' }}</q-item-label>
            <q-item-label caption>
              {{ event.guess }} • {{ event.success ? '+' : '' }}{{ event.pointsDelta }}
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-chip dense :color="event.success ? 'positive' : 'negative'" text-color="white">
              {{ event.success ? 'Hit' : 'Miss' }}
            </q-chip>
          </q-item-section>
        </q-item>
      </q-list>
    </q-card-section>
  </q-card>
</template>

<script setup lang="ts">
import type { GuessEvent } from '@/types/game';

defineProps<{
  events: GuessEvent[];
}>();
</script>
