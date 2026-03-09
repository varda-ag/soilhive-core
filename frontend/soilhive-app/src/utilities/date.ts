/**
 * Backend dates are provided in 'YYYY-MM-DD' UTC format. These must be treated as 'floating dates' in
 * the frontend, ensuring the displayed year, month, and day remain identical regardless of the user's
 * local timezone. This prevents date shifts (e.g., to the previous day) caused by negative/positive
 * timezone offsets.
 */
export function backendToLocalFrontendDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Precondition: the input date must be in local timezone
 */
export function lastDayOfTheMonth(date: Date): Date {
  // Last day of the month at the end of the day (23:59:59.999)
  // Note: using day '0' of the next month automatically rolls back to the last day of the current month
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}
