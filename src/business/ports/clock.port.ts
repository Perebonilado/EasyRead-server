/** Injected so time-dependent rules can be tested without waiting. */
export interface ClockPort {
  now(): Date;
}
