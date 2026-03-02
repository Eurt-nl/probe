import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import PocketBase from 'pocketbase';

const pbUrl = process.env.PB_URL || 'https://pb.9621da15.cloud';
const adminEmail = process.env.PB_ADMIN_EMAIL;
const adminPassword = process.env.PB_ADMIN_PASSWORD;

if (!adminEmail || !adminPassword) {
  console.error('Missing PB_ADMIN_EMAIL or PB_ADMIN_PASSWORD');
  process.exit(1);
}

const seedPath = path.resolve(process.cwd(), 'pocketbase/activity-cards.seed.json');
const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

const pb = new PocketBase(pbUrl);

async function upsertCard(card) {
  const found = await pb.collection('probe_activity_cards').getFirstListItem(`code = "${card.code}"`).catch(() => null);

  if (found) {
    await pb.collection('probe_activity_cards').update(found.id, card);
    console.log(`updated ${card.code}`);
    return;
  }

  await pb.collection('probe_activity_cards').create(card);
  console.log(`created ${card.code}`);
}

async function main() {
  await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
  for (const card of seedData) {
    await upsertCard(card);
  }
  console.log('seed complete');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
