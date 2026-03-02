import process from 'node:process';
import PocketBase from 'pocketbase';

const pbUrl = process.env.PB_URL || 'https://pb.9621da15.cloud';
const adminEmail = process.env.PB_ADMIN_EMAIL;
const adminPassword = process.env.PB_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
  console.error('Missing PB_ADMIN_EMAIL or PB_ADMIN_PASSWORD');
  process.exit(1);
}

const pb = new PocketBase(pbUrl);

const rulePatch = {
  probe_games: {
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''"
  },
  probe_players: {
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''"
  },
  probe_turns: {
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''"
  },
  probe_guesses: {
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''"
  },
  probe_secret_words: {
    listRule: "@request.auth.id != '' && player = @request.auth.id",
    viewRule: "@request.auth.id != '' && player = @request.auth.id"
  }
};

async function ensureSecretWordsCollection(collections) {
  const exists = collections.find((c) => c.name === 'probe_secret_words');
  if (exists) return;

  const games = collections.find((c) => c.name === 'probe_games');
  if (!games) {
    throw new Error('probe_games collection missing; cannot create probe_secret_words');
  }

  await pb.collections.create({
    name: 'probe_secret_words',
    type: 'base',
    system: false,
    listRule: "@request.auth.id != '' && player = @request.auth.id",
    viewRule: "@request.auth.id != '' && player = @request.auth.id",
    createRule: "@request.auth.id != '' && player = @request.auth.id",
    updateRule: "@request.auth.id != '' && player = @request.auth.id",
    deleteRule: "@request.auth.id != '' && player = @request.auth.id",
    fields: [
      {
        id: 'relation700001',
        name: 'game',
        type: 'relation',
        required: true,
        system: false,
        presentable: false,
        hidden: false,
        collectionId: games.id,
        cascadeDelete: true,
        minSelect: 0,
        maxSelect: 1
      },
      {
        id: 'relation700002',
        name: 'player',
        type: 'relation',
        required: true,
        system: false,
        presentable: false,
        hidden: false,
        collectionId: '_pb_users_auth_',
        cascadeDelete: true,
        minSelect: 0,
        maxSelect: 1
      },
      {
        id: 'text700000001',
        name: 'secret_word',
        type: 'text',
        required: false,
        system: false,
        presentable: false,
        hidden: false,
        min: 1,
        max: 12,
        pattern: '^[A-Z.]{1,12}$',
        autogeneratePattern: '',
        primaryKey: false
      }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_probe_secret_words_game_player ON probe_secret_words (game, player)']
  });

  console.log('created probe_secret_words');
}

async function main() {
  await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
  let collections = await pb.collections.getFullList();

  await ensureSecretWordsCollection(collections);
  collections = await pb.collections.getFullList();

  for (const [name, patch] of Object.entries(rulePatch)) {
    const collection = collections.find((c) => c.name === name);
    if (!collection) {
      console.log(`skip missing collection: ${name}`);
      continue;
    }

    await pb.collections.update(collection.id, {
      name: collection.name,
      type: collection.type,
      system: collection.system,
      fields: collection.fields,
      indexes: collection.indexes,
      createRule: collection.createRule,
      updateRule: collection.updateRule,
      deleteRule: collection.deleteRule,
      listRule: patch.listRule,
      viewRule: patch.viewRule
    });

    console.log(`patched rules: ${name}`);
  }

  console.log('rule context fix complete');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
