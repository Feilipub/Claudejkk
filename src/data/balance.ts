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
};
