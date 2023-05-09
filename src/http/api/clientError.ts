/**
 * @desc This class is used to create a custom error that can be used to return a message to the client.
 * @param message - The error message to send to the client.
 * @param status - The status code to send to the client.
 * @returns A custom error object.
 */
export default class ClientError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
