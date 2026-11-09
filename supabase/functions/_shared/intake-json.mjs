// Bound bytes while reading, including chunked or inaccurately labelled bodies.
// This limit is independent of Turnstile and applies even in unconfigured mode.
export const MAX_INTAKE_BODY_BYTES = 64 * 1024;

/** @param {Request} req
 * @returns {Promise<{ok:true, body:Record<string, unknown>} | {ok:false, status:400 | 413}>} */
export async function readIntakeJson(req) {
  const length = req.headers.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > MAX_INTAKE_BODY_BYTES) return {ok:false,status:413};
  if (!req.body) return {ok:false,status:400};
  const reader = req.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {value,done} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_INTAKE_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        return {ok:false,status:413};
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset=0;
    for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
    const body = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    if (!body || typeof body !== 'object' || Array.isArray(body)) return {ok:false,status:400};
    return {ok:true,body};
  } catch {
    return {ok:false,status:400};
  }
}
