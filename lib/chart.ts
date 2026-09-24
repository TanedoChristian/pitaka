/** Round a max value up to a readable axis top (1 / 2 / 5 × 10^n). */
export function niceMax(n: number) {
  if (n <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(n));
  const m = n / exp;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * exp;
}
