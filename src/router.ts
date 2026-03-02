import { createRouter, createWebHistory } from 'vue-router';
import HomePage from '@/pages/HomePage.vue';
import GamePage from '@/pages/GamePage.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomePage },
    { path: '/game/:gameId', name: 'game', component: GamePage, props: true }
  ]
});

export default router;
