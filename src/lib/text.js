// Small wording helpers shared across pages.

// "1 shift", "3 shifts" — the count and the word, with an "s" unless the
// count is exactly one.
export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
