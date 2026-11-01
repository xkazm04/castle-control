/** The local wall clock, the same hour:minute:second view ClockTime gives every other room. */
export function clockText(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}
