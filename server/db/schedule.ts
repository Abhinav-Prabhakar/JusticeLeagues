/** Monday of the current local week, so posted shifts always read "this week". */
export function startOfWeek(now = new Date()): Date {
  const dow = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow, 0, 0, 0, 0);
}

/** Combine a weekday index (0 = Monday) and "HH:MM" into a local ISO instant. */
export function shiftStart(day: number, time: string): string {
  const date = new Date(startOfWeek());
  date.setDate(date.getDate() + day);
  const [hours, minutes] = time.split(":").map(Number);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}
