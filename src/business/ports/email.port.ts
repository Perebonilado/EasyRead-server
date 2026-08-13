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
}
