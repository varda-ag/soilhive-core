export function lastDayOfTheMonth(date: Date): Date {
  // Last day of the month at the end of the day (23:59:59.999)
  // Note: using day '0' of the next month automatically rolls back to the last day of the current month
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}
