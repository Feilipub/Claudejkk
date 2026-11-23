/**
 * Global tuning knobs. Every gameplay constant that is not specific to one item,
 * breed or trait lives here. See design/gdd/horse-system.md for rationale.
 */
export const BALANCE = {
  /** Real seconds per in-game minute. 0.5 → a 12-real-minute day. */
  secondsPerGameMinute: 1.0, // a full day lasts 24 real minutes (playtest feedback: 12 min felt rushed)
  tile: 16,

  horse: {
    /** Pixels/second top speed for each gait at breed speed 5. Scaled by stats. */
    gaitSpeed: { back: 18, walk: 30, trot: 62, canter: 100, gallop: 150 } as Record<string, number>,
    /** Stamina change per second for each gait (negative = drain). */
    gaitStamina: { back: 1, halt: 6, walk: 4, trot: 0.6, canter: -3.2, gallop: -8.5 } as Record<string, number>,
    /** Stamina bar size at breed stamina 5. */
    baseStamina: 100,
    baseHealth: 100,
    /** Need decay per game hour. */
    hungerPerHour: 2.2,
    thirstPerHour: 3.2,
    /** Energy (fatigue) loss per real second of galloping / gain per game hour of rest. */
    energyDrainGallop: 0.05,
    energyRestPerHour: 8,
    dirtPerKm: 2.5,
    hoofWearPerKmUnshod: 1.6,
    /** Stress decay per second at calmRate 1. */
    stressDecay: 1.2,
    /** Health lost per second when urged with empty stamina. */
    overexertionDamage: 2.5,
    /** XP thresholds per bond level 1..5. */
    bondLevels: [0, 120, 340, 700, 1250],
    /** XP awarded per bonding activity before diminishing returns and trait multipliers. */
    bondActivity: {
      pet: 6,
      calm: 8,
      brush: 14,
      feed: 10,
      feedFavorite: 18,
      water: 8,
      cleanHooves: 8,
      treatInjury: 20,
      rideKm: 7,
      timeTogetherHour: 2,
      stressSurvived: 16,
      train: 18,
      shelter: 12,
      wellCaredDay: 25,
    } as Record<string, number>,
    /** After this many repeats in a game day, each further repeat gives a fraction of the XP. */
    bondDailySoftCap: 2,
    bondDiminish: 0.35,
    bondPenalty: {
      starving: 25,
      dehydrated: 25,
      exhausted: 10,
      overexertion: 18,
      fall: 20,
      hit: 30,
      abandonedInStorm: 15,
      gunfireNearHead: 4,
      neglectDay: 20,
    } as Record<string, number>,
    whistleRangeByBond: [180, 320, 520, 820, 1400],
    /** Wild-horse sale is cheaper; trader markup on purchases. */
    traderMarkup: 1.25,
    traderBuyback: 0.55,
  },

  player: {
    walkSpeed: 52,
    runSpeed: 92,
    sprintDrain: 12,
    staminaRegen: 18,
    hungerPerHour: 3,
    thirstPerHour: 4,
    energyPerHour: 3.4,
    carryBase: 30,
  },

  law: {
    witnessRadius: 220,
    reportTimeSec: 18,
    bounty: { murder: 60, assault: 8, theft: 6, horseTheft: 25, robbery: 40, trespass: 2, discharge: 1, jailbreak: 30, animalCruelty: 3 } as Record<string, number>,
    /** Bounty at which marshals or bounty hunters get sent out. */
    hunterThreshold: 40,
  },

  /** Paid work. Formulas and rationale: design/gdd/economy-jobs.md § Formulas. */
  jobs: {
    /** Pay multiplier gained per skill level above 1 (skill levels run 1..6). */
    skillStep: 0.08,
    /** Pay multiplier per point of the employer's faction reputation (-100..100). */
    repStep: 0.005,
    repMin: 0.8,
    repMax: 1.25,
    /** Per-town employer standing: +1 per finished job, -2 per failed or quit job. */
    standingStep: 0.01,
    standingMax: 20,
    standingMin: -10,
    standingGain: 1,
    standingLoss: 2,
    /** Clamp on job performance (late delivery, missed strikes, steers lost). */
    perfMin: 0.5,
    perfMax: 1.2,
    /** Ceiling on the product of all pay multipliers. */
    maxMul: 1.9,
    /** Daily demand roll per offer: pay × [demandMin, demandMax]. */
    demandMin: 0.9,
    demandMax: 1.15,
    /** Delivery deadline in game minutes = deliveryGrace + straight-line tiles × minutesPerTile[template.pace]. */
    deliveryGrace: { normal: 25, express: 12 } as Record<string, number>,
    minutesPerTile: { normal: 0.4, express: 0.26 } as Record<string, number>,
    /** On-time delivery bonus at an instant arrival (scales with time left). */
    earlyBonus: 0.15,
    /** Pay lost per game hour late. */
    latePenaltyPerHour: 0.3,
    /** Strike mini-game: gauge cycles per second and the sweet spot on the 0..1 bar. */
    strikeSpeed: 1.35,
    strikeSweet: 0.8,
    /** Extra misses allowed beyond the strikes needed before a task is botched. */
    strikeMissAllowance: 3,
    /** Game minutes a single strike task (dig, chop, mend) takes. */
    taskMinutes: { dig: 20, chop: 15, harvest: 10, mend: 15, feed: 5, forge: 30, pour: 20 } as Record<string, number>,
    /** A delivery this many game hours past its deadline is cancelled: the consignee hired someone else. */
    lateCutoffHours: 6,
    /** Herding: how strongly a fleeing steer steers toward the pen (0 = pure flight). */
    herdPull: 0.55,
    /** A steer within this many px of the corral gate counts as penned. */
    penRadius: 44,
    /** Bandits on a strongbox run appear between these fractions of the route. */
    ambushWindow: [0.3, 0.7] as [number, number],
    /** Bounty paid for a body instead of a live prisoner. */
    bountyDeadMul: 0.5,
    /** Outlaws spawn when you come within this many px of the reported camp. */
    bountySpawnRadius: 700,
    /** Honor below this and no one hires you for honest work. */
    minHonor: -60,
    /** Expected real minutes of riding per 100 tiles (used only for hourly-rate balance checks). */
    rideMinutesPer100Tiles: 0.35,
  },

  /** Regional trade. See design/gdd/economy-jobs.md § Formulas (Trade). */
  trade: {
    /** Price multiplier where a good is produced / where it is scarce. */
    producedMul: 0.7,
    scarceMul: 1.45,
    /** Market saturation added per unit of a trade good sold (ordinary goods use saturationPerSale). */
    saturationPerSale: 0.06,
    tradeSaturationPerSale: 0.12,
    /** Share of the price a fully flooded market (saturation 1) takes off: price × (1 − sat × depth). */
    saturationDepth: 0.85,
    /** Saturation recovered per game day. */
    saturationRecovery: 0.25,
    /** A shop never buys an item it also sells for more than this share of its own asking price. */
    maxResaleRatio: 0.9,
  },

  /** Homesteads: the long-term money sink. */
  property: {
    /** Days of unpaid tax before produce stops accruing. */
    arrearsGraceDays: 7,
  },
};
