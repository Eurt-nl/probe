import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { Quasar } from 'quasar';
import { Notify } from 'quasar';
import quasarIconSet from 'quasar/icon-set/svg-material-icons';
import quasarLang from 'quasar/lang/en-US';
import '@quasar/extras/material-icons/material-icons.css';
import 'quasar/src/css/index.sass';
import './css/app.css';
import App from './App.vue';
import router from './router';
import { useSessionStore } from '@/stores/sessionStore';

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);
app.use(Quasar, {
  lang: quasarLang,
  iconSet: quasarIconSet,
  plugins: {
    Notify
  }
});

// Restore PocketBase auth state at startup so remote mode works after refresh.
useSessionStore(pinia).init();

app.mount('#app');
