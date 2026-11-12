/** File names of user-provided pictures: the card number with "/" replaced by "_" (card-assets/README.md). */

export function fileStemOf(cardId: string): string {
  return cardId.replace(/\//g, '_');
}

/** Card id from a file name: the first "_" stands for the "/" of the card number. */
export function cardIdOfFile(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace('_', '/');
}
