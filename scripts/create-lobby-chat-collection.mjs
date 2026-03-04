import PocketBase from 'pocketbase';

const pb = new PocketBase(process.env.PB_URL);
await pb.collection('_superusers').authWithPassword(process.env.PB_ADMIN_EMAIL, process.env.PB_ADMIN_PASSWORD);

const cols = await pb.collections.getFullList();
const exists = cols.find((c) => c.name === 'probe_lobby_chat_messages');
if (exists) {
  console.log('exists', exists.id);
  process.exit(0);
}
const users = cols.find((c) => c.name === 'probe_users');
if (!users) {
  throw new Error('probe_users collection missing');
}

const created = await pb.collections.create({
  name: 'probe_lobby_chat_messages',
  type: 'base',
  listRule: "@request.auth.id != ''",
  viewRule: "@request.auth.id != ''",
  createRule: "@request.auth.id != '' && actor = @request.auth.id",
  updateRule: null,
  deleteRule: null,
  fields: [
    {
      id: 'relation910001',
      name: 'actor',
      type: 'relation',
      required: true,
      system: false,
      presentable: false,
      hidden: false,
      collectionId: users.id,
      cascadeDelete: false,
      minSelect: 0,
      maxSelect: 1
    },
    {
      id: 'text910000001',
      name: 'message',
      type: 'text',
      required: true,
      system: false,
      presentable: false,
      hidden: false,
      min: 1,
      max: 500,
      pattern: '',
      autogeneratePattern: '',
      primaryKey: false
    },
    {
      id: 'autodate91000001',
      name: 'message_at',
      type: 'autodate',
      required: false,
      system: false,
      presentable: false,
      hidden: false,
      onCreate: true,
      onUpdate: false
    }
  ],
  indexes: [
    'CREATE INDEX idx_probe_lobby_chat_messages_actor ON probe_lobby_chat_messages (actor)',
    'CREATE INDEX idx_probe_lobby_chat_messages_message_at ON probe_lobby_chat_messages (message_at)'
  ]
});

console.log('created', created.id);
