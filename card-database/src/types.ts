/**
 * The shape of the card database.
 *
 * Printed information is never typed in by hand: it is read from the
 * official card list data stored in sets/<set>/official.json and converted
 * by official.ts. What is written by hand is only what the official data
 * cannot give: the ability data the engine executes, the Chinese
 * explanation, and notes.
 */

import type { Ability, Effect } from '@wso/game-engine';

/** One card as stored from the official card list (fields kept as published). */
export interface OfficialCard {
  no: string;
  name: string;
  kana: string;
  /** "2" character, "3" event, "4" climax. */
  kind: string;
  /** e.g. "[[yellow.gif]]" */
  color: string;
  level: string;
  cost: string;
  power: string;
  /** One "[[soul.gif]]" per soul. */
  soul: string;
  /** e.g. "[[soul.gif]][[bounce.gif]]", or "-" */
  trigger: string;
  traits: string[];
  /** The official card text, "-" when there is none. HTML line breaks as published. */
  text: string;
  flavor: string;
  rare: string;
  /** Path of the official card image (not downloaded, see card-assets). */
  picture: string;
  update_time: string;
  expansion: string;
  side: string;
  /** Official Q&A attached to the card. */
  faqs: { date: string; q: string; a: string }[];
}

export interface OfficialSet {
  source: {
    site: string;
    endpoint: string;
    product: string;
    fetchedOn: string;
    method: string;
    sha256OfCompactCards: string;
    copyright: string;
    /** Sets imported whole by scripts/import-card-sets.ts also record these. */
    expansion?: number;
    released?: string;
    productUrl?: string;
    /** Entries the official list shows for the product, parallel variants included. */
    listedEntries?: number;
    parallelEntries?: number;
  };
  cards: OfficialCard[];
}

/**
 * How far the engine can be trusted with the card.
 *  - verified: ability data checked against the official text, errata and
 *    Q&A, and covered by passing tests. Usable in games.
 *  - pending: written but not yet checked or tested. Test mode only.
 *  - unsupported: 未確認 — 暫不支援自動執行. Cannot be used in games.
 */
export type SupportStatus = 'verified' | 'pending' | 'unsupported';

/**
 * Where an explanation comes from (spec 11). Only AI_ASSISTED exists so far;
 * the interface must show it as unofficial.
 */
export type ExplanationSource = 'OFFICIAL_TEXT' | 'OFFICIAL_RULES' | 'OFFICIAL_QA' | 'COMMUNITY' | 'AI_ASSISTED';

export interface CardRecord {
  /** Official card number, the key into official.json. */
  cardId: string;
  /**
   * Where the record comes from. Absent: written by hand (cards.ts).
   * PATTERN: every line of the official text is a known, tested sentence
   * (patterns.ts). NONE: nothing written yet, so the card is unsupported.
   */
  origin?: 'PATTERN' | 'NONE';
  /** For origin PATTERN: the sentence patterns used. */
  patterns?: string[];
  /** Abilities of a character or climax, in printed order. Absent for a card without text. */
  abilities?: Ability[];
  /** Effect of an event card. */
  effect?: Effect[];
  support: SupportStatus;
  /** Why a card is pending or unsupported, or what the encoding relies on. */
  notes?: string[];
  /** Names other than the official Japanese one. Only from a reliable source; none so far. */
  names?: { en?: string; zh?: string };
  explanation: {
    /** Traditional Chinese explanation of the card text. */
    zh: string;
    source: ExplanationSource;
    /** 待核實 until someone has checked it against the official text. */
    status: '待核實' | '已核實';
  };
}

export interface CardSet {
  /** Folder name under sets/. */
  id: string;
  official: OfficialSet;
  records: CardRecord[];
}
