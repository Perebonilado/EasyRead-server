/**
 * Uniform wrapper every handler returns, so controllers unwrap one shape and
 * cross-cutting concerns have somewhere to hang later.
 */
export class CommandResponse<T> {
  private constructor(readonly data: T) {}

  static of<T>(data: T): CommandResponse<T> {
    return new CommandResponse(data);
  }

  static empty(): CommandResponse<void> {
    return new CommandResponse<void>(undefined);
  }
}
