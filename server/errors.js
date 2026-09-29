export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'Kayıt bulunamadı') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);
