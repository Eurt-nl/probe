import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { Quasar } from 'quasar';
import quasarIconSet from 'quasar/icon-set/svg-material-icons';
import quasarLang from 'quasar/lang/en-US';
import '@quasar/extras/material-icons/material-icons.css';
import 'quasar/src/css/index.sass';
import './css/app.css';
import App from './App.vue';
import router from './router';

const app = createApp(App);

app.use(createPinia());
app.use(router);
app.use(Quasar, {
  lang: quasarLang,
  iconSet: quasarIconSet
});

app.mount('#app');
