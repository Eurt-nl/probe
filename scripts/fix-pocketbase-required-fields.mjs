import process from 'node:process';
import PocketBase from 'pocketbase';

const pbUrl = process.env.PB_URL || 'https://pb.pitch-putt.live';
const adminEmail = process.env.PB_ADMIN_EMAIL;
const adminPassword = process.env.PB_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
  console.error('Missing PB_ADMIN_EMAIL or PB_ADMIN_PASSWORD');
  process.exit(1);
}

const pb = new PocketBase(pbUrl);

const requiredFixes = {
  probe_players: ['seat_index', 'score', 'dot_count', 'is_word_revealed', 'misspelled'],
  probe_guesses: ['is_interruptive', 'success', 'points_delta'],
  probe_in_app_notifications: ['is_read', 'sent_ntfy'],
  probe_app_versions: ['is_latest']
};

async function main() {
  await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);

  const collections = await pb.collections.getFullList();

  for (const [collectionName, fieldsToRelax] of Object.entries(requiredFixes)) {
    const collection = collections.find((entry) => entry.name === collectionName);
    if (!collection) {
      console.log(`skip missing collection: ${collectionName}`);
      continue;
    }

    const updatedFields = collection.fields.map((field) =>
      fieldsToRelax.includes(field.name) ? { ...field, required: false } : field
    );

    await pb.collections.update(collection.id, {
      listRule: collection.listRule,
      viewRule: collection.viewRule,
      createRule: collection.createRule,
      updateRule: collection.updateRule,
      deleteRule: collection.deleteRule,
      name: collection.name,
      type: collection.type,
      system: collection.system,
      indexes: collection.indexes,
      fields: updatedFields
    });

    console.log(`updated ${collectionName}`);
  }

  console.log('schema required-fix complete');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
