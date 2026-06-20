export function isPosterAvailable(date: Date = new Date()): boolean {
  const month = date.getMonth(); // 0-11
  return month === 10 || month === 11 || month === 0;
}

export function getPosterYear(date: Date = new Date()): number {
  const month = date.getMonth();
  if (month === 0) return date.getFullYear() - 1;
  return date.getFullYear();
}
