// Cryptographically secure generator for the passwords an admin issues on
// someone else's behalf — used for both the initial admin-created account
// and every "Regenerate password" afterward.
//
// Must satisfy this project's Supabase Auth password policy exactly
// (Authentication → Providers → Email): at least 10 characters, with a
// lowercase letter, an uppercase letter, a digit and a symbol. The same
// rule is mirrored client-side in src/lib/passwordPolicy.js for the
// screens where a person types their OWN new password; this module is the
// server-side half, and the two have to agree — PASSWORD_MIN_LENGTH there
// and MIN_LENGTH here are the same number for that reason.
//
// The character classes are deliberately narrower than "every printable
// ASCII character": this password is read off an email and typed by hand
// on a phone, so the lookalike characters (0/O, 1/l/I) are left out
// entirely rather than generating credentials that are correct but
// unenterable. Symbols are limited to a set that survives being pasted
// into a shell, a URL, or an HTML email body without escaping surprises.

const LOWER = 'abcdefghijkmnopqrstuvwxyz'      // no 'l'
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'       // no 'I', no 'O'
const DIGITS = '23456789'                      // no '0', no '1'
const SYMBOLS = '!@#$%^&*-_=+?'

const ALL = LOWER + UPPER + DIGITS + SYMBOLS

// 10 is the policy floor, not the target. Generated passwords are longer
// than the minimum a person is allowed to choose for themselves, because
// nobody has to remember this one — it exists only until the forced
// first-login change screen replaces it.
export const MIN_LENGTH = 10
export const GENERATED_LENGTH = 14

// Uniform random integer in [0, max) from the platform CSPRNG, with
// rejection sampling. A plain `getRandomValues(...)[0] % max` is biased
// toward the low end whenever max doesn't divide 2^32 evenly — small here,
// but there is no reason to accept any bias in a credential generator.
// Math.random() is never acceptable for this and is not used anywhere in
// this module.
function randomInt(max: number): number {
  if (max <= 0) throw new Error('randomInt: max must be positive')
  const limit = Math.floor(0x1_0000_0000 / max) * max
  const buf = new Uint32Array(1)
  for (;;) {
    crypto.getRandomValues(buf)
    if (buf[0] < limit) return buf[0] % max
  }
}

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)]
}

// Fisher-Yates, so the four guaranteed characters below don't always land
// in the same four positions (which would make the first four characters
// of every generated password predictable in class, if not in value).
function shuffle(chars: string[]): string[] {
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars
}

// Guarantee one character from each required class first, fill the rest
// from the combined alphabet, then shuffle. Guaranteeing up front (rather
// than generating randomly and retrying until the policy happens to pass)
// means this always terminates and always passes on the first attempt.
export function generatePassword(length: number = GENERATED_LENGTH): string {
  const size = Math.max(length, MIN_LENGTH)
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)]
  while (chars.length < size) chars.push(pick(ALL))
  return shuffle(chars).join('')
}

// The policy check itself, so the generator can be asserted against the
// same rule the server enforces rather than against a restatement of it.
export function meetsPasswordPolicy(password: string): boolean {
  return (
    typeof password === 'string' &&
    password.length >= MIN_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  )
}
