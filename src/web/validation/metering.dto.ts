import { IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * A study-clock heartbeat: the seconds of active study since the last one,
 * and the client's UTC offset so the day resets at THEIR midnight. Both are
 * clamped again server-side; validation here only keeps garbage out.
 */
export class StudyHeartbeatDto {
  @IsInt()
  @Min(0)
  @Max(600)
  seconds!: number;

  @IsOptional()
  @IsInt()
  @Min(-14 * 60)
  @Max(14 * 60)
  tzOffsetMinutes?: number;
}

/** A voice heartbeat: seconds of live call since the last one. */
export class VoiceHeartbeatDto {
  @IsInt()
  @Min(0)
  @Max(600)
  seconds!: number;
}
