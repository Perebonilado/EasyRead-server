export interface EmailPort {
  sendVerification(input: {
    to: string;
    name: string;
    url: string;
  }): Promise<void>;
  sendPasswordReset(input: {
    to: string;
    name: string;
    url: string;
  }): Promise<void>;
  /** The code that lets a person join the school that asked for a school email. */
  sendSchoolCode(input: {
    to: string;
    name: string;
    school: string;
    code: string;
  }): Promise<void>;
}
