export interface Point { x: number; y: number }
export type TowerKind = 'arrow' | 'mage' | 'barracks' | 'cannon';
export type TowerBranchId = 'arrow-ranger' | 'arrow-sniper' | 'mage-arcane' | 'mage-frost'
  | 'cannon-cluster' | 'cannon-siege' | 'barracks-warden' | 'barracks-blade';
export type TowerPriority = 'first' | 'strong' | 'weak';
export type Difficulty = 'normal' | 'veteran' | 'heroic';
export type ChallengeMode = 'standard' | 'four-towers' | 'no-meteor';
export interface EarlyWaveOffer { available: boolean; gold: number; cooldownReduction: number; reason?: string }
export type TowerAbilityKind = 'arrow-volley' | 'arrow-deadeye' | 'arrow-snare'
  | 'mage-chain' | 'mage-overload' | 'mage-frost'
  | 'barracks-cleave' | 'barracks-fortify' | 'barracks-mend'
  | 'cannon-cluster' | 'cannon-pierce' | 'cannon-quake';
export type EnemyKind = 'goblin' | 'wolf' | 'orc' | 'shaman' | 'golem' | 'chieftain'
  | 'bogling' | 'serpent' | 'icewolf' | 'frostguard' | 'imp' | 'juggernaut';
export type LevelId = 'forest' | 'marsh' | 'frost' | 'volcano';
export type SkillKind = 'meteor' | 'reinforce' | 'hero' | 'hero-dash' | 'hero-roots' | 'hero-oath';
export type Phase = 'preparation' | 'battle' | 'intermission' | 'victory' | 'defeat';
export interface ActionResult { ok: boolean; message: string }
export interface EnemyStats {
  name: string; hp: number; speed: number; armor: number; magicResist: number;
  damage: number; attackRate: number; gold: number; lives: number; description: string; color: string;
}
export interface TowerStats {
  name: string; cost: number; upgradeCost: number; description: string;
  damage: number; rate: number; range: number; damageType: 'physical' | 'magic';
  soldierHp?: number; soldierDamage?: number; soldierArmor?: number;
  splashRadius?: number; slowAmount?: number; slowDuration?: number;
  armorBreak?: number; magicBreak?: number; breakDuration?: number;
}
export interface CombatPose {
  /** Remaining visual animation time in seconds; separate from attack cooldown. */
  attackAnimation?: number; hitAnimation?: number;
  /** Normalized direction vector, retained when standing idle. */
  facingX?: number; facingY?: number; attackVariant?: number;
}
export interface Enemy extends Point, CombatPose {
  id: number; kind: EnemyKind; hp: number; maxHp: number; progress: number;
  attackTimer: number; blockedBy: number | null; slowTimer: number; hitTimer: number;
  /** Slow fraction (0..1); overlapping control uses the strongest active source. */
  slowAmount?: number; rootTimer?: number; armorBreakTimer?: number; armorBreakAmount?: number;
  magicBreakTimer?: number; magicBreakAmount?: number;
  bossCast?: { kind: 'chieftain-slam' | 'juggernaut-slam'; x: number; y: number; radius: number; remaining: number; duration: number };
  bossCooldown?: number; bossRecover?: number;
}
export interface Ally extends Point, CombatPose {
  id: number; type: 'hero' | 'soldier' | 'reinforcement'; hp: number; maxHp: number;
  damage: number; armor: number; speed: number; attackTimer: number; respawnTimer: number;
  targetX: number; targetY: number; towerId: number | null; expiresAt?: number; engagedWith: number | null;
  buffTimer?: number; damageMultiplier?: number; armorBonus?: number; poisonTimer?: number; poisonDamage?: number;
}
export interface Tower extends Point, CombatPose {
  id: number; slotId: number; kind: TowerKind; level: number;
  attackTimer: number; rallyX: number; rallyY: number;
  abilities: Partial<Record<TowerAbilityKind, number>>;
  abilityTimers: Partial<Record<TowerAbilityKind, number>>;
  /** Old checkpoints without a priority use first (closest to the exit). */
  targetPriority?: TowerPriority;
  /** Mutually exclusive tier III conversion; prior specializations are retained. */
  branch?: TowerBranchId; branchGoldSpent?: number;
}
export interface Effect extends Point {
  id: number; type: 'arrow' | 'bolt' | 'slash' | 'meteor' | 'ring' | 'heal' | 'text' | 'hero-burst' | 'impact'
    | 'chain' | 'frost-zone' | 'hero-dash' | 'roots' | 'oath' | 'shell' | 'explosion' | 'boss-warning';
  toX?: number; toY?: number; life: number; maxLife: number; color?: string; text?: string;
  sourceId?: number; targetId?: number; style?: string; attackVariant?: number;
  radius?: number; points?: Point[];
}
export interface GameState {
  time: number; phase: Phase; gold: number; lives: number; wave: number; kills: number;
  towers: Tower[]; enemies: Enemy[]; allies: Ally[]; effects: Effect[];
  spawnQueue: { kind: EnemyKind; time: number }[]; waveElapsed: number;
  skillCooldowns: Record<SkillKind, number>; message: string;
  stats: { goldEarned: number; damageDealt: number; skillsUsed: number; towersBuilt: number;
    earlyWavesCalled?: number; earlyWaveGold?: number };
  mapEvent?: MapEventState; report?: BattleReport;
}
export interface MapEventState {
  id: 'marsh-floodgate'; activeRemaining: number; cooldownRemaining: number; activations: number;
}
export interface MapEventStatus {
  id: 'marsh-floodgate'; name: string; position: Point; areaCenter: Point; radius: number; triggerRadius: number;
  ready: boolean; reason: string; activeRemaining: number; cooldownRemaining: number; affectedCount: number;
}
export interface TowerBattleReport {
  id: number; kind: TowerKind; slotId: number; level: number; branch?: TowerBranchId;
  builtAt: number; existingAtStart?: boolean; soldAt?: number; damage: number; kills: number;
}
export interface WaveBattleReport {
  wave: number; startedAt: number; endedAt?: number;
  peakEnemies: number; furthestProgress: number; livesLost: number; damage: number; kills: number;
}
export interface BattleReport {
  version: 1; partial: boolean; startedAt: number; totalDamage: number; totalKills: number;
  towers: TowerBattleReport[];
  hero: { damage: number; kills: number; deaths: number; bossInterrupts: number };
  support: { damage: number; kills: number };
  soldierDeaths: number; mapActivations: number;
  leaks: Partial<Record<EnemyKind, { count: number; lives: number }>>;
  waves: WaveBattleReport[];
}
export interface Wave { name: string; description: string; enemies: { kind: EnemyKind; count: number; interval: number; delay?: number }[] }
export interface Slot extends Point { id: number }
export interface LevelDefinition {
  id: LevelId; name: string; subtitle: string; theme: LevelId;
  path: Point[]; pathLength: number; slots: Slot[]; waves: Wave[];
  startGold: number; lives: number; heroSpawn: Point;
}
/** JSON-compatible simulation checkpoint. All timing and random state is included. */
export interface GameSave {
  version: 1; levelId: LevelId; seed: number; state: GameState;
  difficulty?: Difficulty;
  /** Missing in legacy checkpoints means the original campaign rules. */
  rulesVersion?: 1 | 2;
  challenge?: ChallengeMode;
  /** Captured at deployment; restoring never reapplies entity HP bonuses. */
  upgrades?: import('./doctrines').BattleUpgrades;
  runtime: {
    nextId: number; randomState: number; shamanTimers: [number, number][];
    commandedMovement: number[]; soldierStrikes: [number, number][];
    slowEffects: [number, [string, { amount: number; remaining: number }][]][];
    rootFollowups: [number, { amount: number; duration: number }][];
    frostZones: (Point & { sourceId: number; remaining: number; amount: number; radius: number })[];
  };
}
export interface RenderOptions {
  selectedSlot: number | null; selectedEnemy: number | null; heroSelected: boolean;
  targeting: SkillKind | 'rally' | null; pointer: Point | null; paused: boolean; selectedAlly?: number | null;
  mapEventHighlighted?: boolean;
}
