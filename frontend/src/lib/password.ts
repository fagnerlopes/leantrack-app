// Política única de senha da aplicação, espelhando o backend (auth.ValidatePassword):
// mínimo de 12 caracteres com letra maiúscula, minúscula, número e símbolo.
// Centralizar aqui evita regras divergentes entre o cadastro, o reset do admin,
// a tela de troca obrigatória e o perfil.

export const PASSWORD_MIN_LEN = 12;

export const PASSWORD_POLICY_MSG =
  "A senha deve ter ao menos 12 caracteres, com letra maiúscula, minúscula, número e símbolo.";

const SYMBOLS = "!@#$%^&*()-_=+[]{};:,.?";

// validatePassword devolve uma mensagem de erro (em pt-BR) quando a senha não
// atende à política, ou null quando está válida.
export function validatePassword(pw: string): string | null {
  if (pw.length > 72) return "A senha é longa demais (máx. 72 caracteres).";
  if (pw.length < PASSWORD_MIN_LEN) return PASSWORD_POLICY_MSG;
  const hasUpper = /[A-Z]/.test(pw);
  const hasLower = /[a-z]/.test(pw);
  const hasDigit = /[0-9]/.test(pw);
  // Símbolo = qualquer coisa que não seja letra, número ou espaço.
  const hasSymbol = /[^A-Za-z0-9\s]/.test(pw);
  if (!hasUpper || !hasLower || !hasDigit || !hasSymbol) return PASSWORD_POLICY_MSG;
  return null;
}

// pick escolhe um caractere de `set` usando aleatoriedade criptográfica.
function pick(set: string): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return set[arr[0] % set.length];
}

// generatePassword cria uma senha temporária forte que sempre satisfaz a
// política: garante ao menos um caractere de cada classe e completa o restante
// com o conjunto inteiro, embaralhando o resultado.
export function generatePassword(len = 16): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // sem I/O para evitar confusão visual
  const lower = "abcdefghijkmnpqrstuvwxyz"; // sem l/o
  const digit = "23456789"; // sem 0/1
  const all = upper + lower + digit + SYMBOLS;
  const length = Math.max(len, PASSWORD_MIN_LEN);

  const chars: string[] = [pick(upper), pick(lower), pick(digit), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(all));

  // Embaralhamento Fisher–Yates com fonte criptográfica.
  for (let i = chars.length - 1; i > 0; i--) {
    const r = new Uint32Array(1);
    crypto.getRandomValues(r);
    const j = r[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
