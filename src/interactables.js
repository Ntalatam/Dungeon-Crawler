// Sanctuary features and interaction menus
import { ARMORS, COLORS, CONFIG, WEAPONS } from './constants.js';
import { recalculatePlayerDefense } from './combat.js';

function cloneData(data) {
  return JSON.parse(JSON.stringify(data));
}

function formatMoveBonus(value) {
  if (!value) return '';
  return value > 0 ? `, +${value} speed` : `, ${value} speed`;
}

function describeWeapon(weapon) {
  const extras = [];
  if (weapon.hitBonus) extras.push(`${Math.round(weapon.hitBonus * 100)}% accuracy`);
  if (weapon.reach && weapon.reach > 1) extras.push(`reach ${weapon.reach}`);
  if (weapon.armorPierce) extras.push(`pierce ${weapon.armorPierce}`);
  if (weapon.speedBonus) extras.push(`${weapon.speedBonus > 0 ? '+' : ''}${weapon.speedBonus} speed`);
  if (weapon.cursed) extras.push(`cursed drain ${weapon.hpDrain}`);
  return `${weapon.minDamage}-${weapon.maxDamage} dmg${extras.length ? ` • ${extras.join(' • ')}` : ''}`;
}

function describeArmor(armor) {
  const extras = [];
  if (armor.moveBonus) extras.push(`${armor.moveBonus > 0 ? '+' : ''}${armor.moveBonus} speed`);
  if (armor.lavaWard) extras.push('lava ward');
  return `+${armor.defense} DEF${extras.length ? ` • ${extras.join(' • ')}` : ''}`;
}

function chooseMerchantOffer(pool, fallback, floor, rng) {
  if (pool.length === 0) return cloneData(fallback);

  const rarePool = pool.filter(entry => entry.rare);
  const standardPool = pool.filter(entry => !entry.rare);
  const rareChance = floor <= 2 ? 0.18 : 0.3;
  const activePool = rarePool.length > 0 && rng() < rareChance ? rarePool : (standardPool.length > 0 ? standardPool : pool);
  return cloneData(activePool[Math.floor(rng() * activePool.length)] || fallback);
}

function chooseMerchantWeapon(floor, rng) {
  const maxOfferFloor = floor <= 2 ? floor : floor + 1;
  const pool = Object.values(WEAPONS)
    .filter(weapon => weapon.name !== 'Fists' && weapon.minFloor <= maxOfferFloor);
  return chooseMerchantOffer(pool, WEAPONS.shortsword, floor, rng);
}

function chooseMerchantArmor(floor, rng) {
  const maxOfferFloor = floor <= 2 ? floor : floor + 1;
  const pool = Object.values(ARMORS)
    .filter(armor => armor.minFloor <= maxOfferFloor);
  return chooseMerchantOffer(pool, ARMORS.chainmail, floor, rng);
}

function createMerchantStock(floor, rng) {
  const weapon = chooseMerchantWeapon(floor, rng);
  const armor = chooseMerchantArmor(floor, rng);

  return [
    {
      id: 'weapon',
      kind: 'weapon',
      title: weapon.name,
      description: describeWeapon(weapon),
      cost: 7 + floor * 2 + (weapon.rare ? 3 : 0),
      data: weapon
    },
    {
      id: 'armor',
      kind: 'armor',
      title: armor.name,
      description: describeArmor(armor),
      cost: 7 + floor * 2 + (armor.rare ? 2 : 0),
      data: armor
    },
    {
      id: 'honed_edge',
      kind: 'boon',
      title: 'Honed Edge',
      description: '+1 STR and +3% accuracy',
      cost: 4 + floor * 2,
      data: { strength: 1, hitChanceBonus: 0.03 }
    },
    {
      id: 'ward_seal',
      kind: 'boon',
      title: 'Ward Seal',
      description: '+1 DEF and +1 ward charge',
      cost: 3 + floor * 2,
      data: { defense: 1, wardCharges: 1 }
    }
  ];
}

function createShrineChoices() {
  return [
    {
      id: 'blood_oath',
      kind: 'shrine',
      title: 'Blood Oath',
      description: '+2 STR, -8 max HP',
      data: { strength: 2, maxHpDelta: -8 }
    },
    {
      id: 'stone_vow',
      kind: 'shrine',
      title: 'Stone Vow',
      description: '+2 DEF, -1 speed',
      data: { defense: 2, moveBonus: -1 }
    },
    {
      id: 'storm_mark',
      kind: 'shrine',
      title: 'Storm Mark',
      description: '+2 speed, -1 DEF',
      data: { moveBonus: 2, defense: -1 }
    }
  ];
}

function createFieldCacheChoices() {
  return [
    {
      id: 'vanguard_kit',
      kind: 'cache',
      title: 'Vanguard Kit',
      description: `${WEAPONS.dagger.name} • ${describeWeapon(WEAPONS.dagger)}`,
      data: { weapon: cloneData(WEAPONS.dagger) }
    },
    {
      id: 'bulwark_kit',
      kind: 'cache',
      title: 'Bulwark Kit',
      description: `${ARMORS.leather.name} • ${describeArmor(ARMORS.leather)} • +1 ward`,
      data: { armor: cloneData(ARMORS.leather), wardCharges: 1 }
    },
    {
      id: 'scout_kit',
      kind: 'cache',
      title: 'Scout Kit',
      description: '+1 speed this floor • +1 ward • +2% accuracy',
      data: { floorMoveBonus: 1, wardCharges: 1, hitChanceBonus: 0.02 }
    }
  ];
}

function getFeaturePosition(room, type) {
  if (type !== 'cache') {
    return { x: room.center.x, y: room.center.y };
  }

  const candidates = [
    { x: room.center.x + 1, y: room.center.y },
    { x: room.center.x - 1, y: room.center.y },
    { x: room.center.x, y: room.center.y + 1 },
    { x: room.center.x, y: room.center.y - 1 }
  ];

  return candidates.find(pos =>
    pos.x > room.x &&
    pos.x < room.x + room.width - 1 &&
    pos.y > room.y &&
    pos.y < room.y + room.height - 1
  ) || { x: room.center.x, y: room.center.y };
}

function createFeature(room, type, floor, rng) {
  const position = getFeaturePosition(room, type);
  const base = {
    x: position.x,
    y: position.y,
    room,
    type,
    used: false
  };

  if (type === 'cache') {
    return {
      ...base,
      name: 'Field Cache',
      color: COLORS.FEATURE_CACHE,
      prompt: 'Claim a field kit',
      description: 'Choose one opening loadout before you push deeper.',
      bannerTitle: 'Entry Hall — Field Cache',
      bannerSubtitle: 'Take one starting kit and commit to a line immediately.',
      choices: createFieldCacheChoices()
    };
  }

  if (type === 'fountain') {
    return {
      ...base,
      name: 'Silver Fountain',
      color: COLORS.FEATURE_FOUNTAIN,
      prompt: 'Drink from the Silver Fountain',
      description: 'Restore your health and gain ward charges once.',
      bannerTitle: 'Sanctuary — Silver Fountain',
      bannerSubtitle: 'A rare refuge: heal now and leave with protection.'
    };
  }

  if (type === 'merchant') {
    return {
      ...base,
      name: 'Quartermaster',
      color: COLORS.FEATURE_MERCHANT,
      prompt: 'Speak with the Quartermaster',
      description: 'Spend gold on gear and run-defining upgrades.',
      bannerTitle: 'Sanctuary — Quartermaster',
      bannerSubtitle: 'A trader found a route below. Gold becomes leverage here.',
      stock: createMerchantStock(floor, rng)
    };
  }

  return {
    ...base,
    name: 'Oath Shrine',
    color: COLORS.FEATURE_SHRINE,
    prompt: 'Kneel at the Oath Shrine',
    description: 'Accept a powerful blessing and its cost.',
    bannerTitle: 'Sanctuary — Oath Shrine',
    bannerSubtitle: 'Power has a price. Choose the shape of this run.',
    choices: createShrineChoices()
  };
}

export function createSanctuaryFeatures(rooms, floor, rng) {
  const sanctuaries = rooms.filter(room => room.type === 'sanctuary');
  if (sanctuaries.length === 0) return [];

  const merchantIndex = floor >= 2 ? Math.floor(rng() * sanctuaries.length) : -1;

  return sanctuaries.map((room, index) => {
    if (index === merchantIndex) {
      room.featureType = 'merchant';
      return createFeature(room, 'merchant', floor, rng);
    }

    const type = rng() < 0.55 ? 'fountain' : 'shrine';
    room.featureType = type;
    return createFeature(room, type, floor, rng);
  });
}

export function createFloorInteractables(rooms, startRoom, floor, rng) {
  const features = createSanctuaryFeatures(rooms, floor, rng);
  if (floor === 1 && startRoom) {
    features.unshift(createFeature(startRoom, 'cache', floor, rng));
  }
  return features;
}

export function getInteractableAt(interactables, x, y) {
  return interactables.find(feature => feature.x === x && feature.y === y && !feature.used) || null;
}

export function getInteractableDescription(feature) {
  if (!feature) return '';
  return feature.description;
}

export function createInteractionMenu(feature, player) {
  if (!feature || feature.used) return null;

  if (feature.type === 'fountain') {
    return null;
  }

  if (feature.type === 'cache') {
    return {
      feature,
      title: feature.name,
      subtitle: 'Choose one opening kit. The rest of the cache will be lost.',
      color: feature.color,
      options: feature.choices.map(choice => ({
        id: choice.id,
        title: choice.title,
        description: choice.description,
        cost: null,
        disabled: false
      }))
    };
  }

  if (feature.type === 'merchant') {
    return {
      feature,
      title: feature.name,
      subtitle: `Gold: ${player.gold}`,
      color: feature.color,
      options: feature.stock.map(offer => ({
        id: offer.id,
        title: offer.title,
        description: offer.description,
        cost: offer.cost,
        disabled: !!offer.sold
      }))
    };
  }

  return {
    feature,
    title: feature.name,
    subtitle: 'Choose one blessing. The shrine fades afterward.',
    color: feature.color,
    options: feature.choices.map(choice => ({
      id: choice.id,
      title: choice.title,
      description: choice.description,
      cost: null,
      disabled: false
    }))
  };
}

function applyStatDelta(player, field, delta) {
  player[field] = (player[field] || 0) + delta;
}

export function applyInteraction(feature, optionId, player, messageLog, renderer) {
  if (!feature || feature.used) {
    return { closeMenu: true };
  }

  if (feature.type === 'cache') {
    const choice = feature.choices.find(entry => entry.id === optionId);
    if (!choice) {
      return { closeMenu: true };
    }

    if (choice.data.weapon) player.weapon = cloneData(choice.data.weapon);
    if (choice.data.armor) player.armor = cloneData(choice.data.armor);
    if (choice.data.wardCharges) applyStatDelta(player, 'wardCharges', choice.data.wardCharges);
    if (choice.data.floorMoveBonus) applyStatDelta(player, 'floorMoveBonus', choice.data.floorMoveBonus);
    if (choice.data.hitChanceBonus) applyStatDelta(player, 'hitChanceBonus', choice.data.hitChanceBonus);
    recalculatePlayerDefense(player);

    feature.used = true;
    messageLog.add(`You claim the ${choice.title}. The rest of the cache is abandoned.`);
    renderer.addEffect(feature.x, feature.y, choice.title.toUpperCase(), feature.color);
    renderer.flash(feature.color, 180);
    return { closeMenu: true };
  }

  if (feature.type === 'fountain') {
    const missing = player.maxHp - player.hp;
    const restored = missing > 0 ? missing : Math.min(8, player.maxHp);
    player.hp = Math.min(player.maxHp, player.hp + Math.max(restored, 0));
    player.wardCharges += CONFIG.FOUNTAIN_WARD_CHARGES;
    feature.used = true;
    messageLog.add(`The ${feature.name} restores you and grants ${CONFIG.FOUNTAIN_WARD_CHARGES} ward charges.`);
    renderer.addEffect(feature.x, feature.y, 'SANCTIFIED', feature.color);
    renderer.flash(feature.color, 220);
    return { closeMenu: true };
  }

  if (feature.type === 'merchant') {
    const offer = feature.stock.find(entry => entry.id === optionId);
    if (!offer || offer.sold) {
      return { closeMenu: false };
    }
    if (player.gold < offer.cost) {
      messageLog.add('You do not have enough gold.');
      return { closeMenu: false };
    }

    player.gold -= offer.cost;
    offer.sold = true;

    switch (offer.kind) {
      case 'weapon':
        player.weapon = cloneData(offer.data);
        messageLog.add(`You buy ${offer.title} and equip it immediately.`);
        renderer.addEffect(feature.x, feature.y, offer.title, COLORS.ITEM_WEAPON);
        break;
      case 'armor':
        player.armor = cloneData(offer.data);
        recalculatePlayerDefense(player);
        messageLog.add(`You buy ${offer.title} and strap it on.`);
        renderer.addEffect(feature.x, feature.y, offer.title, COLORS.ITEM_ARMOR);
        break;
      case 'boon':
        if (offer.data.strength) applyStatDelta(player, 'strength', offer.data.strength);
        if (offer.data.hitChanceBonus) applyStatDelta(player, 'hitChanceBonus', offer.data.hitChanceBonus);
        if (offer.data.defense) applyStatDelta(player, 'bonusDefense', offer.data.defense);
        if (offer.data.moveBonus) applyStatDelta(player, 'moveBonus', offer.data.moveBonus);
        if (offer.data.wardCharges) applyStatDelta(player, 'wardCharges', offer.data.wardCharges);
        recalculatePlayerDefense(player);
        messageLog.add(`The Quartermaster prepares ${offer.title.toLowerCase()} for this run.`);
        renderer.addEffect(feature.x, feature.y, offer.title, feature.color);
        break;
    }

    if (feature.stock.every(entry => entry.sold)) {
      feature.used = true;
      messageLog.add('The Quartermaster packs up and moves on.');
      return { closeMenu: true };
    }

    return { closeMenu: false, refreshMenu: true };
  }

  const choice = feature.choices.find(entry => entry.id === optionId);
  if (!choice) {
    return { closeMenu: true };
  }

  if (choice.data.strength) applyStatDelta(player, 'strength', choice.data.strength);
  if (choice.data.defense) applyStatDelta(player, 'bonusDefense', choice.data.defense);
  if (choice.data.moveBonus) applyStatDelta(player, 'moveBonus', choice.data.moveBonus);
  if (choice.data.maxHpDelta) {
    player.maxHp = Math.max(10, player.maxHp + choice.data.maxHpDelta);
    player.hp = Math.min(player.hp, player.maxHp);
  }
  recalculatePlayerDefense(player);

  feature.used = true;
  messageLog.add(`You accept ${choice.title}. The shrine falls silent.`);
  renderer.addEffect(feature.x, feature.y, choice.title.toUpperCase(), feature.color);
  renderer.flash(feature.color, 200);
  return { closeMenu: true };
}
