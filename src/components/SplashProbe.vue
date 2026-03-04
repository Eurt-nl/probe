<template>
  <div class="splash" :class="{ closing: isClosing }">
    <div class="splash-surface">
      <div class="splash-logo-wrap">
        <img src="/logo-wordcourt.png" alt="WordCourt logo" class="splash-logo" />
      </div>

      <div
        v-for="row in rows"
        :key="row.id"
        class="word-row"
        :style="rowStyle(row.id)"
      >
        <div class="word-track">
          <div v-for="(slot, index) in row.slots" :key="`${row.id}-${index}`" class="slot-cell">
            <div
              class="probe-slot"
              :class="[
                slotVisible(slot) ? 'probe-slot--open' : 'probe-slot--closed',
                `probe-slot--player-${row.colorIndex}`
              ]"
              :style="{ '--i': index }"
            >
              <div class="probe-slot-top">{{ slotVisible(slot) ? '' : index + 1 }}</div>
              <div class="probe-slot-char">{{ slotVisible(slot) ? slotDisplay(slot.char) : '' }}</div>
              <div class="probe-slot-bottom">{{ slotVisible(slot) ? slotValue(index) : '' }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="splash-actions" :class="{ show: phase >= 2 }">
        <button type="button" class="start-btn" @click="onContinue">START</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

type RowId = 'north' | 'west' | 'east' | 'south';

interface Slot {
  char: string;
  isClosed: boolean;
}

interface Row {
  id: RowId;
  colorIndex: 0 | 1 | 2 | 3;
  slots: Slot[];
}

const emit = defineEmits<{
  (event: 'done'): void;
}>();

const slotValues = [5, 10, 15, 15, 10, 5, 5, 10, 15, 15, 10, 5] as const;
const phase = ref(0);
const isClosing = ref(false);
const timers: Array<ReturnType<typeof setTimeout>> = [];

// Patroon: '-' = gesloten kaart, '.' = zichtbare stip.
const rows: Row[] = [
  { id: 'north', colorIndex: 1, slots: buildSlots('M-LTIPLA-ER.') },
  { id: 'west', colorIndex: 2, slots: buildSlots('...GUES-IN--') },
  { id: 'east', colorIndex: 3, slots: buildSlots('.VICTORY....') },
  { id: 'south', colorIndex: 0, slots: buildSlots('..CHA--ENGE.') }
];

function buildSlots(pattern: string): Slot[] {
  return pattern.split('').map((char) => ({
    char: char === '-' ? '' : char,
    isClosed: char === '-'
  }));
}

function slotDisplay(char: string): string {
  return char === '.' ? '•' : char;
}

function slotValue(index: number): number {
  return slotValues[index] ?? 0;
}

function slotVisible(slot: Slot): boolean {
  return !slot.isClosed;
}

function moveDelay(id: RowId): string {
  if (phase.value < 1) return '0ms';
  if (id === 'north') return '0ms';
  if (id === 'west') return '180ms';
  if (id === 'east') return '380ms';
  return '580ms';
}

function initialTransform(id: RowId): string {
  if (id === 'north') return 'translate(-50%, -24vh) rotate(0deg)';
  if (id === 'south') return 'translate(-50%, 32vh) rotate(0deg)';
  if (id === 'west') return 'translate(-44vw, -50%) rotate(90deg)';
  return 'translate(44vw, -50%) rotate(-90deg)';
}

function stackedTransform(id: RowId): string {
  // Volgorde: north, west, east, south
  if (id === 'north') return 'translate(-50%, -96px) rotate(0deg)';
  if (id === 'west') return 'translate(-50%, -30px) rotate(0deg)';
  if (id === 'east') return 'translate(-50%, 36px) rotate(0deg)';
  return 'translate(-50%, 102px) rotate(0deg)';
}

function rowStyle(id: RowId): Record<string, string> {
  return {
    transform: phase.value >= 1 ? stackedTransform(id) : initialTransform(id),
    transitionDelay: moveDelay(id)
  };
}

function onContinue(): void {
  if (isClosing.value) return;
  isClosing.value = true;
  timers.push(setTimeout(() => emit('done'), 320));
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || phase.value < 3) return;
  onContinue();
}

onMounted(() => {
  // Rustiger timing.
  timers.push(setTimeout(() => (phase.value = 1), 900));
  timers.push(setTimeout(() => (phase.value = 2), 2600));
  timers.push(setTimeout(() => (phase.value = 3), 3300));
  window.addEventListener('keydown', onKeyDown);
});

onBeforeUnmount(() => {
  timers.forEach((timer) => clearTimeout(timer));
  window.removeEventListener('keydown', onKeyDown);
});
</script>

<style scoped>
.splash {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: grid;
  place-items: center;
  background: #ece4cf;
  transition: opacity 250ms ease;
  overflow: hidden;
}

.splash.closing {
  opacity: 0;
}

.splash-surface {
  position: relative;
  width: 100vw;
  height: 100vh;
}

.splash-logo-wrap {
  position: absolute;
  left: 50%;
  top: max(8px, env(safe-area-inset-top));
  transform: translateX(-50%);
  z-index: 0;
  pointer-events: none;
  width: min(1800px, 98vw);
  height: min(560px, 58vh);
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.splash-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 6px 20px rgba(0, 0, 0, 0.22));
}

.word-row {
  position: absolute;
  left: 50%;
  top: 58%;
  z-index: 2;
  transition: transform 1300ms cubic-bezier(0.2, 0.85, 0.2, 1);
  transform-origin: center center;
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

.splash-actions {
  position: fixed;
  left: 50%;
  bottom: calc(14px + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 3;
  opacity: 0;
  pointer-events: none;
  transition: opacity 250ms ease;
}

.splash-actions.show {
  opacity: 1;
  pointer-events: auto;
}

.start-btn {
  min-width: 150px;
  height: 46px;
  border: 0;
  border-radius: 10px;
  background: #1e88e5;
  color: #fff;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(30, 136, 229, 0.35);
}

.start-btn:hover {
  background: #1976d2;
}

@media (max-width: 430px) {
  .splash-logo-wrap {
    width: min(760px, 98vw);
    height: min(360px, 44vh);
  }

  .splash-logo {
    width: 100%;
    height: 100%;
  }

  .word-track {
    gap: 4px;
  }

  .slot-cell {
    width: 22px;
    min-width: 22px;
    max-width: 22px;
    flex-basis: 22px;
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

  .start-btn {
    min-width: 130px;
    height: 42px;
    font-size: 16px;
  }
}
</style>
