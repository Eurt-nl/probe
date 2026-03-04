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

function buildProbeUsersCollection() {
  return {
    name: 'probe_users',
    type: 'auth',
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: '',
    updateRule: 'id = @request.auth.id',
    deleteRule: 'id = @request.auth.id',
    fields: [
      {
        id: 'text1579384326',
        name: 'name',
        type: 'text',
        required: true,
        system: false,
        presentable: true,
        hidden: false,
        min: 1,
        max: 255,
        pattern: '',
        autogeneratePattern: '',
        primaryKey: false
      },
      {
        id: 'file376926767',
        name: 'avatar',
        type: 'file',
        required: false,
        system: false,
        presentable: false,
        hidden: false,
        maxSelect: 1,
        maxSize: 0,
        mimeTypes: ['image/jpeg', 'image/png', 'image/svg+xml', 'image/gif', 'image/webp'],
        thumbs: null,
        protected: false
      },
      {
        id: 'text3578368839',
        name: 'display_name',
        type: 'text',
        required: false,
        system: false,
        presentable: false,
        hidden: false,
        min: 2,
        max: 24,
        pattern: '',
        autogeneratePattern: '',
        primaryKey: false
      }
    ],
    indexes: ['CREATE UNIQUE INDEX idx_name_probe_users ON probe_users (name)'],
    authRule: '',
    manageRule: null,
    authAlert: {
      enabled: false,
      emailTemplate: {
        subject: 'Login from a new location',
        body: '<p>Hello,</p><p>We noticed a login to your {APP_NAME} account from a new location:</p><p><em>{ALERT_INFO}</em></p><p><strong>If this was not you, change your password immediately.</strong></p><p>If this was you, ignore this email.</p><p><br/>Thanks,<br/>{APP_NAME} team</p>'
      }
    },
    oauth2: {
      mappedFields: {
        id: '',
        name: 'name',
        username: '',
        avatarURL: 'avatar'
      },
      enabled: false
    },
    passwordAuth: {
      enabled: true,
      identityFields: ['email']
    },
    mfa: {
      enabled: false,
      duration: 1800,
      rule: ''
    },
    otp: {
      enabled: false,
      duration: 180,
      length: 8,
      emailTemplate: {
        subject: 'OTP for {APP_NAME}',
        body: '<p>Hello,</p><p>Your one-time password is: <strong>{OTP}</strong></p><p><br/>Thanks,<br/>{APP_NAME} team</p>'
      }
    },
    authToken: {
      duration: 604800
    },
    passwordResetToken: {
      duration: 1800
    },
    emailChangeToken: {
      duration: 1800
    },
    verificationToken: {
      duration: 259200
    },
    fileToken: {
      duration: 180
    },
    verificationTemplate: {
      subject: 'Confirm your {APP_NAME} signup request',
      body: '<p>Hello,</p><p>Click below to verify your email:</p><p><a class="btn" href="{APP_URL}/_/#/auth/confirm-verification/{TOKEN}" target="_blank" rel="noopener">Verify email</a></p>'
    },
    resetPasswordTemplate: {
      subject: 'Reset your {APP_NAME} password',
      body: '<p>Hello,</p><p>Click below to reset your password.</p><p><a class="btn" href="{APP_URL}/_/#/auth/confirm-password-reset/{TOKEN}" target="_blank" rel="noopener">Reset password</a></p>'
    },
    confirmEmailChangeTemplate: {
      subject: 'Confirm your {APP_NAME} new email address',
      body: '<p>Hello,</p><p>Click below to confirm your new email address.</p><p><a class="btn" href="{APP_URL}/_/#/auth/confirm-email-change/{TOKEN}" target="_blank" rel="noopener">Confirm new email</a></p>'
    }
  };
}

async function updateCollectionWithIndexFallback(collectionId, payload) {
  try {
    return await pb.collections.update(collectionId, payload);
  } catch (error) {
    const indexErrors = error?.response?.data?.indexes;
    if (!indexErrors || !Array.isArray(payload.indexes)) {
      throw error;
    }

    const invalidIndexPositions = Object.keys(indexErrors)
      .map((key) => Number(key))
      .filter((value) => Number.isInteger(value));

    if (!invalidIndexPositions.length) {
      throw error;
    }

    const filteredIndexes = payload.indexes.filter((_, index) => !invalidIndexPositions.includes(index));
    const retryPayload = { ...payload, indexes: filteredIndexes };
    const retried = await pb.collections.update(collectionId, retryPayload);
    console.log(`warning: skipped ${invalidIndexPositions.length} invalid index(es) for ${payload.name}`);
    return retried;
  }
}

async function ensureProbeUsers(collections) {
  const existing = collections.find((entry) => entry.name === 'probe_users');
  if (existing) {
    console.log(`probe_users exists: ${existing.id}`);
    return existing;
  }

  const created = await pb.collections.create(buildProbeUsersCollection());
  console.log(`probe_users created: ${created.id}`);
  return created;
}

async function ensureProbeAppVersions(collections) {
  const existing = collections.find((entry) => entry.name === 'probe_app_versions');
  if (existing) {
    console.log(`probe_app_versions exists: ${existing.id}`);
    return existing;
  }

  const created = await pb.collections.create({
    name: 'probe_app_versions',
    type: 'base',
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: null,
    updateRule: null,
    deleteRule: null,
    fields: [
      {
        id: 'text800000001',
        name: 'version',
        type: 'text',
        required: true,
        system: false,
        presentable: false,
        hidden: false,
        min: 1,
        max: 30,
        pattern: '',
        autogeneratePattern: '',
        primaryKey: false
      },
      {
        id: 'date800000001',
        name: 'build_date',
        type: 'date',
        required: true,
        system: false,
        presentable: false,
        hidden: false,
        min: '',
        max: ''
      },
      {
        id: 'text800000002',
        name: 'min_supported_version',
        type: 'text',
        required: false,
        system: false,
        presentable: false,
        hidden: false,
        min: 0,
        max: 30,
        pattern: '',
        autogeneratePattern: '',
        primaryKey: false
      },
      {
        id: 'editor80000001',
        name: 'release_notes',
        type: 'editor',
        required: false,
        system: false,
        presentable: false,
        hidden: false,
        convertURLs: false
      },
      {
        id: 'bool800000001',
        name: 'is_latest',
        type: 'bool',
        required: false,
        system: false,
        presentable: false,
        hidden: false
      }
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_probe_app_versions_version ON probe_app_versions (version)',
      'CREATE INDEX idx_probe_app_versions_is_latest ON probe_app_versions (is_latest)'
    ]
  });

  console.log(`probe_app_versions created: ${created.id}`);
  return created;
}

async function ensureProbeInAppNotifications(collections, probeUsersId) {
  const existing = collections.find((entry) => entry.name === 'probe_in_app_notifications');
  if (existing) {
    console.log(`probe_in_app_notifications exists: ${existing.id}`);
    return existing;
  }

  const games = collections.find((entry) => entry.name === 'probe_games');
  if (!games) {
    console.log('skip probe_in_app_notifications create: missing probe_games');
    return null;
  }

  const created = await pb.collections.create({
    name: 'probe_in_app_notifications',
    type: 'base',
    listRule: '@request.auth.id = user',
    viewRule: '@request.auth.id = user',
    createRule: null,
    updateRule: '@request.auth.id = user',
    deleteRule: '@request.auth.id = user',
    fields: [
      {
        id: 'relation600001',
        name: 'user',
        type: 'relation',
        required: true,
        system: false,
        presentable: false,
        hidden: false,
        collectionId: probeUsersId,
        cascadeDelete: true,
        minSelect: 0,
        maxSelect: 1
      },
      {
        id: 'relation600002',
        name: 'game',
        type: 'relation',
        required: false,
        system: false,
        presentable: false,
        hidden: false,
        collectionId: games.id,
        cascadeDelete: true,
        minSelect: 0,
        maxSelect: 1
      },
      {
        id: 'select60000001',
        name: 'type',
        type: 'select',
        required: true,
        system: false,
        presentable: false,
        hidden: false,
        maxSelect: 1,
        values: ['turn_start', 'game_update', 'system']
      },
      {
        id: 'text600000001',
        name: 'title',
        type: 'text',
        required: true,
        system: false,
        presentable: false,
        hidden: false,
        min: 2,
        max: 120,
        pattern: '',
        autogeneratePattern: '',
        primaryKey: false
      },
      {
        id: 'text600000002',
        name: 'body',
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
        id: 'bool600000001',
        name: 'is_read',
        type: 'bool',
        required: false,
        system: false,
        presentable: false,
        hidden: false
      },
      {
        id: 'bool600000002',
        name: 'sent_ntfy',
        type: 'bool',
        required: false,
        system: false,
        presentable: false,
        hidden: false
      },
      {
        id: 'text600000003',
        name: 'ntfy_topic',
        type: 'text',
        required: false,
        system: false,
        presentable: false,
        hidden: false,
        min: 0,
        max: 120,
        pattern: '',
        autogeneratePattern: '',
        primaryKey: false
      },
      {
        id: 'autodate60000001',
        name: 'sent_at',
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
      'CREATE INDEX idx_probe_inapp_user_read ON probe_in_app_notifications (user, is_read)',
      'CREATE INDEX idx_probe_inapp_game ON probe_in_app_notifications (game)',
      'CREATE INDEX idx_probe_inapp_turnstart_sent_at ON probe_in_app_notifications (type, sent_at)'
    ]
  });

  console.log(`probe_in_app_notifications created: ${created.id}`);
  return created;
}

async function ensureProbeLobbyPresence(collections, probeUsersId) {
  const existing = collections.find((entry) => entry.name === 'probe_lobby_presence');
  if (existing) {
    console.log(`probe_lobby_presence exists: ${existing.id}`);
    return existing;
  }

  const games = collections.find((entry) => entry.name === 'probe_games');
  if (!games) {
    console.log('skip probe_lobby_presence create: missing probe_games');
    return null;
  }

  const created = await pb.collections.create({
    name: 'probe_lobby_presence',
    type: 'base',
    listRule: "@request.auth.id != ''",
    viewRule: "@request.auth.id != ''",
    createRule: "@request.auth.id != '' && player = @request.auth.id",
    updateRule: "@request.auth.id != '' && player = @request.auth.id",
    deleteRule: "@request.auth.id != '' && player = @request.auth.id",
    fields: [
      {
        id: 'relation910101',
        name: 'player',
        type: 'relation',
        required: true,
        system: false,
        presentable: false,
        hidden: false,
        collectionId: probeUsersId,
        cascadeDelete: true,
        minSelect: 0,
        maxSelect: 1
      },
      {
        id: 'select91010001',
        name: 'location',
        type: 'select',
        required: true,
        system: false,
        presentable: false,
        hidden: false,
        maxSelect: 1,
        values: ['lobby', 'game']
      },
      {
        id: 'relation910102',
        name: 'game',
        type: 'relation',
        required: false,
        system: false,
        presentable: false,
        hidden: false,
        collectionId: games.id,
        cascadeDelete: true,
        minSelect: 0,
        maxSelect: 1
      },
      {
        id: 'autodate91010001',
        name: 'last_seen',
        type: 'autodate',
        required: false,
        system: false,
        presentable: false,
        hidden: false,
        onCreate: true,
        onUpdate: true
      }
    ],
    indexes: [
      'CREATE UNIQUE INDEX idx_probe_lobby_presence_player ON probe_lobby_presence (player)',
      'CREATE INDEX idx_probe_lobby_presence_location_last_seen ON probe_lobby_presence (location, last_seen)'
    ]
  });

  console.log(`probe_lobby_presence created: ${created.id}`);
  return created;
}

async function patchRelationsToProbeUsers(collections, probeUsersId, oldUserCollectionIds) {
  const targets = collections.filter(
    (entry) => entry.name.startsWith('probe_') || entry.name === 'probe_in_app_notifications'
  );

  for (const collection of targets) {
    const hasRelationPatch = collection.fields.some(
      (field) => field.type === 'relation' && oldUserCollectionIds.has(field.collectionId)
    );

    if (!hasRelationPatch) {
      continue;
    }

    const patchedFields = collection.fields.map((field) => {
      if (field.type !== 'relation') return field;
      if (!oldUserCollectionIds.has(field.collectionId)) return field;

      // PocketBase does not allow relation collection changes in-place.
      // Recreate the field with a new internal field id but keep the same public field name.
      const replacementFieldId = `${field.id}_pu`;
      return {
        ...field,
        id: replacementFieldId,
        collectionId: probeUsersId
      };
    });

    await updateCollectionWithIndexFallback(collection.id, {
      name: collection.name,
      type: collection.type,
      system: collection.system,
      fields: patchedFields,
      indexes: collection.indexes,
      listRule: collection.listRule,
      viewRule: collection.viewRule,
      createRule: collection.createRule,
      updateRule: collection.updateRule,
      deleteRule: collection.deleteRule
    });

    console.log(`patched user relations in ${collection.name}`);
  }
}

async function ensureLobbyReadableRules(collections) {
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

  for (const [collectionName, rules] of Object.entries(rulePatch)) {
    const collection = collections.find((entry) => entry.name === collectionName);
    if (!collection) continue;

    await updateCollectionWithIndexFallback(collection.id, {
      name: collection.name,
      type: collection.type,
      system: collection.system,
      fields: collection.fields,
      indexes: collection.indexes,
      createRule: collection.createRule,
      updateRule: collection.updateRule,
      deleteRule: collection.deleteRule,
      listRule: rules.listRule,
      viewRule: rules.viewRule
    });

    console.log(`patched rules in ${collectionName}`);
  }
}

async function main() {
  await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);

  let collections = await pb.collections.getFullList();
  const oldUsers = collections.find((entry) => entry.name === 'users' || entry.id === '_pb_users_auth_');

  const probeUsers = await ensureProbeUsers(collections);
  await ensureProbeAppVersions(collections);
  await ensureProbeInAppNotifications(collections, probeUsers.id);
  await ensureProbeLobbyPresence(collections, probeUsers.id);

  collections = await pb.collections.getFullList();

  const oldUserCollectionIds = new Set(['_pb_users_auth_']);
  if (oldUsers) oldUserCollectionIds.add(oldUsers.id);

  await patchRelationsToProbeUsers(collections, probeUsers.id, oldUserCollectionIds);
  collections = await pb.collections.getFullList();
  await ensureLobbyReadableRules(collections);

  console.log('migration complete');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
